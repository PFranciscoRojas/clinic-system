#!/usr/bin/env bash
#
# monitor.sh — asks, every five minutes, the only question that matters:
# can a psychologist sign in and get to her consulting room?
#
# On 2026-08-18 MercadoPago charged a subscription at 16:58 and the professional
# who paid it stayed locked out behind a 402 for the rest of the day. Nobody
# found out until she said so. Through the whole incident /healthz answered 200,
# because the process was perfectly alive — it was the door that was shut. A
# liveness check would have reported green from the first minute to the last.
#
# So this does not ask whether the process is up. It signs in as a real user and
# walks the first three requests the app makes on entry: login, /auth/me, and
# the professional workspace. If any of them stops answering the way it answers
# for a working consulting room, that is an outage, whatever /healthz says.
#
# It runs on the host and not inside the app on purpose. A check that dies with
# the thing it watches reports nothing at the one moment anybody needed it to.
#
# Cron:
#   */5 * * * * /root/clinic-system/scripts/monitor.sh >> /var/log/sghcp-monitor.log 2>&1
#
# Config — /etc/sghcp/monitor.env (mode 600):
#   MONITOR_EMAIL     canary user, a PROFESSIONAL in the internal demo org
#   MONITOR_PASSWORD  its password
#   ALERT_EMAIL       where the alarm goes
# RESEND_API_KEY and RESEND_FROM are read from the app's env file, so the key
# has one home on this host and cannot drift out of sync with the one the app
# sends mail with.

set -uo pipefail

# ── knobs ───────────────────────────────────────────────────────────────────
BASE_URL="${MONITOR_BASE_URL:-https://app.chapni.com}"
ENV_FILE="${ENV_FILE:-/root/clinic-system/.env}"
MONITOR_ENV="${MONITOR_ENV:-/etc/sghcp/monitor.env}"
STATE_DIR="${MONITOR_STATE_DIR:-/var/lib/sghcp/monitor}"
COMPOSE_FILE="${COMPOSE_FILE:-/root/clinic-system/docker-compose.prod.yml}"

DISK_THRESHOLD="${MONITOR_DISK_THRESHOLD:-80}"

# A one-hour recording transcribes in about nine minutes at the RTF measured on
# this box. Twenty is that with room to spare, so a slow job is not an alarm and
# a wedged one is.
QUEUE_MAX_IDLE_S="${MONITOR_QUEUE_MAX_IDLE_S:-1200}"

# Re-send an alert that is still true once an hour. Often enough that a night
# outage is still shouting in the morning, rare enough to stay readable.
REPEAT_AFTER_S="${MONITOR_REPEAT_AFTER_S:-3600}"

# core-api is deliberately absent. Since blue/green there is no fixed container
# name to look for — during a deploy both colours are up on purpose, and after a
# retire only one is, so "is it running" has no single right answer here. The
# entry probe already answers the better question: whether a professional can
# sign in through whichever colour Caddy is pointing at.
CONTAINERS="${MONITOR_CONTAINERS:-sghcp_ai_service sghcp_postgres sghcp_redis sghcp_caddy}"

# ── verdicts ────────────────────────────────────────────────────────────────
# Everything below is a pure function of its arguments. That is what
# monitor_test.sh exercises: the checks reach out to the network, but the
# reading of what came back — the part that decides whether a human is woken —
# is decided here, in the open, with no clock and no socket.

is_number() { [[ "${1:-}" =~ ^[0-9]+$ ]]; }

# probe_verdict <healthz> <login> <me> <workspace>
# HTTP codes in the order the app asks for them; 000 means curl never got an
# answer. The first code that is not 200 decides, because everything after a
# failure is a consequence of it: when /healthz returns 502 the three requests
# behind it are 000 too, and reporting that as "unreachable" would name the
# symptom furthest from the cause.
probe_verdict() {
    local stage code
    for stage in "healthz:$1" "login:$2" "me:$3" "workspace:$4"; do
        code="${stage##*:}"
        [[ "$code" == 200 ]] && continue

        # Silence is not a status. Whatever stage we got to, nothing answered.
        [[ "$code" == 000 ]] && { echo unreachable; return; }

        case "${stage%%:*}" in
            healthz) echo api-down ;;
            login)   echo login-broken ;;
            me)      echo session-broken ;;
            workspace)
                # The incident this whole script exists for. The canary lives in
                # the internal demo organization, whose subscription runs to
                # 2099: a 402 here never means "she has not paid", it means the
                # gate is turning away somebody who has. Kept as its own verdict
                # because the fix is nothing like the others — nobody restarts a
                # container to undo a 402.
                if [[ "$code" == 402 ]]; then echo locked-out; else echo workspace-broken; fi
                ;;
        esac
        return
    done
    echo ok
}

# disk_verdict <used_percent> <threshold>
disk_verdict() {
    local pct="$1" threshold="$2"
    is_number "$pct" || { echo unknown; return; }
    # At the threshold, not past it. 80 is the number we said we would act on,
    # and a check that waits for 81 quietly moves it.
    (( pct >= threshold )) && { echo full; return; }
    echo ok
}

# queue_verdict <pending> <oldest_idle_seconds> <max_idle_seconds>
# Pending entries are normal: a job is pending from the moment a worker picks it
# up until it acknowledges. What is not normal is one that has been pending
# longer than the work could possibly take.
queue_verdict() {
    local pending="$1" idle="$2" max="$3"
    is_number "$pending" || { echo unknown; return; }
    (( pending == 0 )) && { echo ok; return; }
    # Something is pending but we could not read how long for. Reading that as
    # "fine" is how a stuck queue stays invisible; it is a failure to measure,
    # and it gets its own answer.
    is_number "$idle" || { echo unknown; return; }
    (( idle >= max )) && { echo stuck; return; }
    echo ok
}

# lag_verdict <lag> <last_delivered_id> <previous_last_delivered_id>
# Lag is work nobody has picked up yet. A moment of it is a queue doing its job.
# Lag that has not moved since the previous run is a worker that is up and not
# consuming — the failure mode where every container looks healthy and audio
# quietly stops becoming clinical notes.
lag_verdict() {
    local lag="$1" last_id="$2" prev_id="$3"
    is_number "$lag" || { echo unknown; return; }
    (( lag == 0 )) && { echo ok; return; }
    # No previous reading: first run after a reboot. One sample cannot tell a
    # backlog from a stall, and inventing an alarm from it trains people to
    # ignore the next one.
    [[ -z "$prev_id" ]] && { echo ok; return; }
    [[ "$last_id" == "$prev_id" ]] && { echo stalled; return; }
    echo ok
}

# containers_verdict <expected…> — reads "name<TAB>status" from stdin, exactly
# as `docker ps` prints it.
#
# A container that is listed is not a container that is working. Postgres and
# Redis carry real healthchecks, so docker knows the difference between running
# and answering, and throwing that away by matching on the name alone would
# hide the up-and-broken case this whole script was written for.
containers_verdict() {
    local table down=() unhealthy=() name status
    table="$(cat)"
    for name in $1; do
        status="$(awk -F'\t' -v n="$name" '$1==n {print $2; exit}' <<< "$table")"
        if [[ -z "$status" ]]; then
            down+=("$name")
        elif [[ "$status" == *"(unhealthy)"* ]]; then
            unhealthy+=("$name")
        elif [[ "$status" != Up* ]]; then
            # Restarting, Exited, Created. Anything but Up is not serving.
            down+=("$name")
        fi
    done

    local out=""
    (( ${#down[@]} ))      && out="down:${down[*]}"
    (( ${#unhealthy[@]} )) && out="${out:+$out }unhealthy:${unhealthy[*]}"
    echo "${out:-ok}"
}

# resend_accepted <response body> — did the mail actually get taken?
#
# Resend answers a successful send with an id and a failure with an error
# object, both 200-shaped enough that curl is happy either way. Throwing that
# answer away and recording the alert as sent is how an alerting path goes
# quiet: a rotated key, a suspended domain or a rate limit would leave the
# monitor writing "told them" into its state file every five minutes while
# nobody was told anything.
resend_accepted() {
    [[ "$1" == *'"id"'* ]] && { echo yes; return; }
    echo no
}

# alert_decision <previous_verdict> <last_sent_epoch> <now_epoch> <verdict> <repeat_after_s>
# Whether this reading reaches a human. The checks above are worth nothing if
# this is wrong in either direction: too eager and the alarm becomes noise
# people filter, too quiet and an outage runs all night unreported.
alert_decision() {
    local prev="$1" last_sent="$2" now="$3" verdict="$4" repeat="$5"

    if [[ "$verdict" == ok ]]; then
        # Recovery is news too. Without it the last thing anyone heard about
        # this check is that it was broken, and silence reads as still broken.
        [[ -n "$prev" && "$prev" != ok ]] && { echo recovered; return; }
        echo nothing; return
    fi

    # A different failure while one is already open. The repeat window belongs
    # to the old problem, not to this one, and swallowing "the database is gone"
    # because the disk was already full is exactly the trade nobody would make
    # deliberately.
    [[ "$prev" != "$verdict" ]] && { echo send; return; }

    is_number "$last_sent" || { echo send; return; }
    (( now - last_sent >= repeat )) && { echo repeat; return; }
    echo silent
}


# ── the world ───────────────────────────────────────────────────────────────
# Everything past this point talks to something: the network, docker, the disk.
# None of it is under test, which is why every judgement it could have made was
# moved above instead. Each check prints one line, "verdict<TAB>detail", so the
# reading and the reporting stay separable.

load_env() {
    local f
    for f in "$ENV_FILE" "$MONITOR_ENV"; do
        # shellcheck disable=SC1090
        [[ -f "$f" ]] && { set -a; source "$f"; set +a; }
    done
}

http_code() { # http_code <url> [curl args…]
    local url="$1"; shift
    curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$@" "$url" 2>/dev/null || echo 000
}

# check_entry — sign in, then make the two requests the app makes right after.
# Read only. It looks at a consulting room, it never writes to one.
check_entry() {
    local healthz login login_out login_body token me workspace
    healthz="$(http_code "$BASE_URL/healthz")"

    login_out="$(curl -s -w '\n%{http_code}' --max-time 15 \
        -X POST "$BASE_URL/api/v1/auth/login" \
        -H 'Content-Type: application/json' \
        -d "{\"email\":\"${MONITOR_EMAIL:-}\",\"password\":\"${MONITOR_PASSWORD:-}\"}" 2>/dev/null)"
    login="$(tail -n1 <<< "$login_out")"
    login_body="$(sed '$d' <<< "$login_out")"
    [[ "$login" =~ ^[0-9]{3}$ ]] || login=000
    token="$(grep -o '"access_token":"[^"]*"' <<< "$login_body" | head -1 | cut -d'"' -f4)"

    if [[ -z "$token" ]]; then
        # A 200 carrying no token is a broken login however friendly the status
        # line is, and it must not read as "logged in, then nothing happened".
        [[ "$login" == 200 ]] && login=502
        me=000; workspace=000
    else
        me="$(http_code "$BASE_URL/api/v1/auth/me" -H "Authorization: Bearer $token")"
        # The patient list, which is the first screen of a working day. Chosen
        # over the professional profile — the endpoint that actually returned
        # 402 on 2026-08-18 — because both sit behind the same subscription
        # gate, and this one also has to reach Postgres and come back through
        # RLS with the tenant scope set. Same lockout, more of the system.
        workspace="$(http_code "$BASE_URL/api/v1/patients" -H "Authorization: Bearer $token")"
    fi

    printf '%s\t%s\n' \
        "$(probe_verdict "$healthz" "$login" "$me" "$workspace")" \
        "healthz=$healthz login=$login me=$me pacientes=$workspace"
}

check_disk() {
    local pct
    pct="$(df -P / | awk 'NR==2 {gsub(/%/,"",$5); print $5}')"
    printf '%s\t%s\n' \
        "$(disk_verdict "${pct:-x}" "$DISK_THRESHOLD")" \
        "raíz al ${pct:-?}% (umbral ${DISK_THRESHOLD}%)"
}

check_containers() {
    local running
    running="$(docker ps --format '{{.Names}}\t{{.Status}}' 2>/dev/null)"
    printf '%s\t%s\n' \
        "$(containers_verdict "$CONTAINERS" <<< "$running")" \
        "$(awk -F'\t' '{printf "%s(%s) ", $1, $2}' <<< "$running")"
}

redis_cli() {
    docker compose -f "$COMPOSE_FILE" exec -T redis \
        redis-cli -a "${REDIS_PASSWORD:-}" --no-auth-warning "$@" 2>/dev/null
}

# group_field — pulls one field out of an XINFO GROUPS reply, which arrives as a
# flat name/value list. Every stream here carries exactly one consumer group.
group_field() { # group_field <xinfo output> <field>
    awk -v f="$2" '$0==f {getline; print; exit}' <<< "$1"
}

# check_queue — the three AI lanes. A lane can fail two different ways and they
# need different words: work picked up and never finished (stuck), or work
# nobody picked up at all while the worker sits there looking healthy (stalled).
check_queue() {
    local worst=ok details=()
    local lane stream group
    for lane in "ai_jobs:ai-service" "ai_jobs_fast:ai-service-fast" "ai_jobs_window:ai-service-window"; do
        stream="${lane%%:*}"; group="${lane##*:}"

        local info lag last_id prev_id pending idle="" verdict lagv
        info="$(redis_cli XINFO GROUPS "$stream")"
        lag="$(group_field "$info" lag)"
        last_id="$(group_field "$info" last-delivered-id)"

        pending="$(redis_cli XPENDING "$stream" "$group" | head -1 | tr -d '[:space:]')"
        if [[ "$pending" =~ ^[0-9]+$ ]] && (( pending > 0 )); then
            # IDLE 0 - + 1 asks for the oldest unacknowledged entry; the third
            # line of the reply is how long it has sat there, in milliseconds.
            local idle_ms
            idle_ms="$(redis_cli XPENDING "$stream" "$group" IDLE 0 - + 1 | sed -n '3p' | tr -d '[:space:]')"
            [[ "$idle_ms" =~ ^[0-9]+$ ]] && idle=$(( idle_ms / 1000 ))
        fi

        prev_id="$(cat "$STATE_DIR/$stream.lastid" 2>/dev/null || true)"
        verdict="$(queue_verdict "${pending:-x}" "${idle:-x}" "$QUEUE_MAX_IDLE_S")"
        lagv="$(lag_verdict "${lag:-x}" "${last_id:-}" "${prev_id:-}")"
        mkdir -p "$STATE_DIR" && printf '%s\n' "${last_id:-}" > "$STATE_DIR/$stream.lastid"

        details+=("$stream pendientes=${pending:-?} espera=${idle:-0}s lag=${lag:-?}")
        [[ "$verdict" != ok ]] && worst="$stream-$verdict"
        [[ "$lagv"    != ok ]] && worst="$stream-$lagv"
    done
    printf '%s\t%s\n' "$worst" "${details[*]}"
}

send_alert() { # send_alert <check> <verdict> <detail> <decision>
    local check="$1" verdict="$2" detail="$3" decision="$4"
    local subject body
    if [[ "$decision" == recovered ]]; then
        subject="Chapni ok — $check"
        body="El chequeo <b>$check</b> volvió a pasar.<br><br><code>$detail</code>"
    else
        subject="Chapni ALERTA — $check: $verdict"
        body="El chequeo <b>$check</b> falló con <b>$verdict</b>.<br><br><code>$detail</code><br><br>$(hostname) · $(date -u '+%Y-%m-%d %H:%M UTC')"
    fi

    if [[ -z "${RESEND_API_KEY:-}" || -z "${ALERT_EMAIL:-}" ]]; then
        echo "[monitor] no puedo avisar: falta RESEND_API_KEY o ALERT_EMAIL" >&2
        return 1
    fi
    local answer
    answer="$(curl -s --max-time 20 -X POST https://api.resend.com/emails \
        -H "Authorization: Bearer $RESEND_API_KEY" \
        -H 'Content-Type: application/json' \
        -d "$(printf '{"from":"%s","to":"%s","subject":"%s","html":"%s"}' \
              "${RESEND_FROM:-Chapni <no-reply@chapni.com>}" "$ALERT_EMAIL" "$subject" "$body")")"

    if [[ "$(resend_accepted "$answer")" != yes ]]; then
        echo "[monitor] Resend rechazó el aviso: $answer" >&2
        return 1
    fi
}

run_check() { # run_check <name> <verdict-tab-detail>
    local name="$1" verdict detail
    verdict="${2%%$'\t'*}"
    detail="${2#*$'\t'}"

    local now state prev last_sent decision
    now="$(date +%s)"
    state="$STATE_DIR/$name.state"
    mkdir -p "$STATE_DIR"
    prev=""; last_sent=""
    [[ -f "$state" ]] && IFS='|' read -r prev last_sent < "$state"

    decision="$(alert_decision "$prev" "${last_sent:-x}" "$now" "$verdict" "$REPEAT_AFTER_S")"
    printf '[monitor] %-11s %-22s %s (%s)\n' "$name" "$verdict" "$detail" "$decision"

    case "$decision" in
        send|repeat|recovered)
            if send_alert "$name" "$verdict" "$detail" "$decision"; then
                printf '%s|%s\n' "$verdict" "$now" > "$state"
            else
                # Not sent, so not recorded as sent. Keeping the old send time
                # makes the next cycle try again instead of counting this as
                # told and falling into the hour of silence.
                printf '%s|%s\n' "$verdict" "${last_sent:-0}" > "$state"
            fi
            ;;
        *)
            printf '%s|%s\n' "$verdict" "${last_sent:-0}" > "$state"
            ;;
    esac
    [[ "$verdict" == ok ]]
}

main() {
    load_env
    local failed=0
    run_check entry      "$(check_entry)"      || failed=1
    run_check containers "$(check_containers)" || failed=1
    run_check queue      "$(check_queue)"      || failed=1
    run_check disk       "$(check_disk)"       || failed=1
    return $failed
}

# Only run when executed, not when sourced by the test.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
