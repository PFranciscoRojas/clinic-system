#!/usr/bin/env bash
#
# deploy_switch.sh — put a new core-api in front of traffic without a gap, and
# make going back cost seconds instead of a CI run.
#
# Until today a deploy replaced the container in place: `docker compose up -d
# core-api` stopped the old one and started the new one under the same name.
# That has two failure modes with witnesses. Caddy answers 502 for the seconds
# in between, and if the new binary does not start at all there is nothing to
# go back to — the previous image was already pruned, so recovering meant
# reverting the commit and waiting for a 2.19 GB rebuild while a psychologist
# sat locked out.
#
# So: two colours. The one that is NOT serving gets the new image, has to report
# healthy on its own, and only then does Caddy get pointed at it. The old one
# stays up. Going back is one file write and a config reload.
#
#   deploy_switch.sh deploy <tag>   full cycle, leaves the old colour running
#   deploy_switch.sh rollback       point Caddy back at the other colour
#   deploy_switch.sh retire         stop the colour that is not serving
#   deploy_switch.sh status         what is running and what is serving
#
# Everything above the "the world" line is a pure function and is tested by
# scripts/deploy_switch_test.sh inside `make verify`. Nothing else in the suite
# fails when a deploy script gets its arithmetic wrong, and this one decides
# whether production keeps serving.
set -uo pipefail

COMPOSE_DIR="${COMPOSE_DIR:-/root/clinic-system}"
UPSTREAM_FILE="${UPSTREAM_FILE:-$COMPOSE_DIR/caddy-upstream.conf}"
HEALTH_TIMEOUT_S="${HEALTH_TIMEOUT_S:-90}"
IMAGE="${CORE_API_IMAGE:-ghcr.io/pfranciscorojas/clinic-system-core-api}"

# ── pure ────────────────────────────────────────────────────────────────────

# other_colour <colour> — the one that is not this one.
other_colour() {
    case "$1" in
        blue)  echo green ;;
        green) echo blue ;;
        *)     echo "" ;;
    esac
}

# parse_active <contents of caddy-upstream.conf> — which colour is serving.
# Comments are ignored: the file carries an explanation and only one directive.
# An unreadable file returns nothing, and the caller must refuse to guess —
# picking a colour at random here would point traffic at whatever is stale.
parse_active() {
    local line
    line="$(printf '%s\n' "$1" | grep -E '^[[:space:]]*reverse_proxy' | head -1)"
    case "$line" in
        *core-api-blue:*)  echo blue ;;
        *core-api-green:*) echo green ;;
        *)                 echo "" ;;
    esac
}

# upstream_line <colour> — the file body that makes that colour serve.
upstream_line() {
    printf 'reverse_proxy core-api-%s:8080\n' "$1"
}

# health_verdict <docker inspect health status> <seconds waited> <timeout>
# healthy      → switch
# starting     → keep waiting, unless the clock ran out
# unhealthy    → give up now; retrying a container that failed its own probe
#                only delays the report
# empty/absent → the container is not there at all
health_verdict() {
    local status="$1" waited="$2" timeout="$3"
    case "$status" in
        healthy)   echo ready ;;
        unhealthy) echo failed ;;
        starting)
            if [[ "$waited" -ge "$timeout" ]]; then echo timeout; else echo waiting; fi
            ;;
        *) echo missing ;;
    esac
}

# switch_decision <active colour> <target colour> <health verdict>
# The gate. Traffic moves only for a colour that said it is healthy, and only
# when it is not already the one serving.
switch_decision() {
    local active="$1" target="$2" verdict="$3"
    [[ -z "$target" ]] && { echo abort-unknown-target; return; }
    [[ "$active" == "$target" ]] && { echo already-serving; return; }
    case "$verdict" in
        ready)   echo switch ;;
        failed)  echo abort-unhealthy ;;
        timeout) echo abort-timeout ;;
        missing) echo abort-missing ;;
        *)       echo abort-unknown-health ;;
    esac
}

# apply_verdict <colour we asked for> <colour Caddy actually reports>
# `caddy reload` exits 0 for a config it read and accepted. It says nothing
# about whether that config was the one just written — and on 2026-08-20 it was
# not: the file is bind-mounted into the container by inode, so replacing it
# with a rename (the usual atomic write) left Caddy reading the file it had
# opened at start-up. The reload succeeded, reported success, and the traffic
# never moved. A switch that cannot be seen from inside the container did not
# happen, whatever the exit code says.
apply_verdict() {
    local asked="$1" seen="$2"
    [[ -z "$seen" ]] && { echo unreadable; return; }
    [[ "$asked" == "$seen" ]] && { echo applied; return; }
    echo stale
}

# image_sha <image reference> — the build inside a colour, as the tag says.
# The tag is the only place the SHA survives outside the binary, and `latest`
# means "whatever CI pushed last", which names no particular build at all.
image_sha() {
    local ref="$1" tag
    [[ -z "$ref" ]] && { echo ""; return; }
    tag="${ref##*:}"
    [[ "$tag" == "$ref" ]] && { echo ""; return; }   # sin dos puntos: sin etiqueta
    # A registry with a port has a colon that is not the tag separator, and
    # everything after it is a path. A tag never contains a slash.
    [[ "$tag" == */* ]] && { echo ""; return; }
    [[ "$tag" == latest ]] && { echo latest; return; }
    echo "${tag:0:40}"
}

# state_line — one snapshot of who is serving and what is left to fall back to.
#
# Written to /var/lib/sghcp, which core-api already mounts read-only, the same
# way scripts/backup.sh reports the nightly dump. The application cannot see
# Docker and must not: giving it the socket is what PR #107 removed. So the host
# writes down what it knows and the console reads it.
state_line() {
    printf '%s|%s|%s|%s|%s|%s\n' "$1" "$2" "$3" "$4" "$5" "$6"
}

# history_line <epoch> <colour> <sha> <version> <subject>
#
# One deploy, for the record. The point is not nostalgia: the images stay in
# GHCR tagged by SHA and by version, so a line here is a build you can still go
# back to long after its colour was reused.
#
# The subject goes last and on purpose. Deciding what to roll back to is not
# helped by a hash and barely helped by a number — what answers the question is
# "fix(billing): que quien ya pagó pueda pedir que se verifique otra vez". It is
# last because a commit subject may contain the separator, so the reader splits
# with a limit and the remainder stays whole.
history_line() {
    printf '%s|%s|%s|%s|%s\n' "$1" "$2" "$3" "${4:-}" "$(sanitise_subject "${5:-}")"
}

# sanitise_subject — one line, no separators of its own, and bounded.
#
# Read from git on the server rather than passed in from the workflow: a commit
# message is attacker-controlled text, and interpolating it into a remote shell
# command is how `$(…)` in a branch name becomes code execution on the box that
# holds the clinical records.
sanitise_subject() {
    printf '%s' "$1" | tr '\n|' '  ' | cut -c1-160
}

# deploy_needed <sha ya sirviendo> <sha candidato>
#
# Con la ventana nocturna el despliegue corre por horario, así que la mayoría de
# las noches no habrá nada nuevo. Desplegar igual no es inofensivo: `retire`
# apaga el color de reserva y el ciclo vuelve a levantar la MISMA versión, así
# que se pierde el punto de retorno a cambio de nada. Una noche tranquila debe
# dejar las cosas exactamente como estaban.
deploy_needed() {
    local serving="$1" candidate="$2"
    [[ -z "$candidate" ]] && { echo abort-no-candidate; return; }
    [[ -z "$serving" ]] && { echo deploy; return; }   # sin nada sirviendo, adelante
    [[ "$serving" == "$candidate" ]] && { echo skip-same; return; }
    echo deploy
}

# rollback_target <active colour> <state of the other colour from docker ps>
# Going back is only free while the previous colour is still up. Once it has
# been retired there is nothing to point at, and the honest answer is to say so
# rather than to switch traffic to a container that is not running.
rollback_target() {
    local active="$1" other_state="$2" other
    other="$(other_colour "$active")"
    [[ -z "$other" ]] && { echo abort-unknown-active; return; }
    case "$other_state" in
        running) echo "$other" ;;
        *)       echo abort-other-not-running ;;
    esac
}

# ── the world ───────────────────────────────────────────────────────────────

compose() { docker compose -f "$COMPOSE_DIR/docker-compose.yml" "$@"; }

# The live upstream file is deliberately not in git — the server rewrites it on
# every deploy and the deploy runs `git pull` over the same directory, so a
# tracked copy would be restored underneath the runtime. Docker also mounts a
# single file by inode, so any checkout that replaced it would leave Caddy
# reading the old one without saying so.
#
# Seeded here rather than by hand: if it is missing when compose starts, Docker
# creates a DIRECTORY at that path and Caddy fails to load with an error that
# does not mention any of this.
seed_upstream() {
    [[ -f "$UPSTREAM_FILE" ]] && return 0
    echo "[switch] $UPSTREAM_FILE no existe — lo creo apuntando a blue"
    cp "$COMPOSE_DIR/caddy-upstream.conf.example" "$UPSTREAM_FILE" 2>/dev/null \
        || upstream_line blue > "$UPSTREAM_FILE"
}

active_colour() {
    parse_active "$(cat "$UPSTREAM_FILE" 2>/dev/null)"
}

container_state() { # container_state <colour>
    docker inspect -f '{{.State.Status}}' "sghcp_core_api_$1" 2>/dev/null || echo ""
}

health_status() { # health_status <colour>
    docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{end}}' \
        "sghcp_core_api_$1" 2>/dev/null || echo ""
}

wait_healthy() { # wait_healthy <colour> — echoes the final verdict
    local colour="$1" waited=0 verdict
    while true; do
        verdict="$(health_verdict "$(health_status "$colour")" "$waited" "$HEALTH_TIMEOUT_S")"
        [[ "$verdict" != waiting ]] && { echo "$verdict"; return; }
        sleep 3
        waited=$(( waited + 3 ))
    done
}

# What Caddy itself reports as the serving colour, read from inside the
# container. This is the only reading that counts: the host's copy of the file
# and the container's can differ, and when they do it is silent.
observed_colour() {
    parse_active "$(compose exec -T caddy cat /etc/caddy/upstream.conf 2>/dev/null)"
}

point_caddy_at() { # point_caddy_at <colour>
    local colour="$1" body
    # Keep the explanation at the top of the file; only the directive changes.
    body="$(grep -E '^#|^$' "$UPSTREAM_FILE"; upstream_line "$colour")"

    # Written IN PLACE, never renamed into position. Docker bind-mounts a single
    # file by inode: a rename gives the host a new file and leaves the container
    # holding the old one, so the tidy atomic write is exactly the thing that
    # breaks the switch. Truncating keeps the inode the mount is pinned to.
    printf '%s\n' "$body" > "$UPSTREAM_FILE" || return 1

    # reload parses and validates first: a bad config leaves the running one in
    # place instead of dropping the site.
    compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile || return 1

    local verdict
    verdict="$(apply_verdict "$colour" "$(observed_colour)")"
    if [[ "$verdict" != applied ]]; then
        echo "[switch] Caddy NO quedó en $colour (lectura desde el contenedor: $verdict)." >&2
        echo "[switch] Revisa el montaje de caddy-upstream.conf: si el fichero se borró" >&2
        echo "[switch] y se recreó en el host, el contenedor sigue viendo el inodo viejo" >&2
        echo "[switch] y hay que recrear Caddy (docker compose up -d --force-recreate caddy)." >&2
        return 1
    fi
}

STATE_DIR_HOST="${DEPLOY_STATE_DIR:-/var/lib/sghcp}"
HISTORY_MAX="${DEPLOY_HISTORY_MAX:-20}"

colour_sha() { # colour_sha <colour>
    image_sha "$(docker inspect -f '{{.Config.Image}}' "sghcp_core_api_$1" 2>/dev/null || echo '')"
}

# Records what is serving so the superadmin console can show it. Best effort on
# purpose: a console that cannot be updated is not a reason to abort a deploy
# that already worked.
record_state() {
    local active other now
    active="$(active_colour)"
    other="$(other_colour "$active")"
    now="$(date +%s)"
    [[ -z "$active" ]] && return 0
    mkdir -p "$STATE_DIR_HOST" 2>/dev/null || return 0

    state_line "$now" "$active" "$(colour_sha "$active")" \
               "$other" "$(colour_sha "$other")" \
               "$(container_state "$other")" \
        > "$STATE_DIR_HOST/deploy_state" 2>/dev/null || return 0
    chmod 644 "$STATE_DIR_HOST/deploy_state" 2>/dev/null
}

record_history() { # record_history <colour> <sha> [version]
    local f="$STATE_DIR_HOST/deploy_history" subject
    mkdir -p "$STATE_DIR_HOST" 2>/dev/null || return 0
    # From the clone on this machine, never from an argument. See sanitise_subject.
    subject="$(git -C "$COMPOSE_DIR" log -1 --format=%s "$2" 2>/dev/null || echo '')"
    history_line "$(date +%s)" "$1" "$2" "${3:-}" "$subject" >> "$f" 2>/dev/null || return 0
    # Newest last, so the tail is what survives.
    tail -n "$HISTORY_MAX" "$f" > "$f.trim" 2>/dev/null && mv "$f.trim" "$f"
    chmod 644 "$f" 2>/dev/null
}

cmd_status() {
    local active
    active="$(active_colour)"
    printf 'sirviendo:  %s\n' "${active:-DESCONOCIDO}"
    local c
    for c in blue green; do
        printf '  %-6s estado=%-10s salud=%-10s imagen=%s\n' "$c" \
            "$(container_state "$c" || echo -)" \
            "$(health_status "$c" || echo -)" \
            "$(docker inspect -f '{{.Config.Image}}' "sghcp_core_api_$c" 2>/dev/null || echo -)"
    done
}

cmd_deploy() {
    local tag="${1:-}"
    [[ -z "$tag" ]] && { echo "uso: deploy_switch.sh deploy <tag>" >&2; return 2; }

    local serving decision
    serving="$(colour_sha "$(active_colour)")"
    decision="$(deploy_needed "$serving" "$tag")"
    if [[ "$decision" == skip-same ]]; then
        echo "[deploy] $tag ya está sirviendo — no hay nada que desplegar."
        return 0
    fi

    local active target
    active="$(active_colour)"
    if [[ -z "$active" ]]; then
        echo "[deploy] no puedo leer qué color sirve en $UPSTREAM_FILE — no adivino" >&2
        return 1
    fi
    target="$(other_colour "$active")"
    echo "[deploy] sirviendo=$active  destino=$target  tag=$tag"

    CORE_API_TAG="$tag" compose pull "core-api-$target" || return 1
    CORE_API_TAG="$tag" compose up -d --no-deps "core-api-$target" || return 1

    local verdict decision
    verdict="$(wait_healthy "$target")"
    decision="$(switch_decision "$active" "$target" "$verdict")"
    echo "[deploy] salud de $target: $verdict → $decision"

    if [[ "$decision" != switch ]]; then
        echo "[deploy] NO se cambia el tráfico. $active sigue sirviendo." >&2
        docker logs "sghcp_core_api_$target" --tail 40 2>&1 | sed 's/^/    /' >&2
        return 1
    fi

    point_caddy_at "$target" || { echo "[deploy] falló el reload de Caddy" >&2; return 1; }
    record_history "$target" "$tag" "${DEPLOY_VERSION:-}"
    record_state
    echo "[deploy] tráfico en $target. $active sigue encendido para volver atrás."
}

cmd_rollback() {
    local active target
    active="$(active_colour)"
    target="$(rollback_target "$active" "$(container_state "$(other_colour "$active")")")"
    case "$target" in
        blue|green) ;;
        *) echo "[rollback] $target" >&2; return 1 ;;
    esac
    echo "[rollback] $active → $target"
    point_caddy_at "$target" || return 1
    # Sin versión: la de este build ya está escrita en su línea original del
    # historial, y el lector la busca por SHA. Inventar una aquí daría dos
    # números distintos para el mismo binario.
    record_history "$target" "$(colour_sha "$target")" ""
    record_state
    echo "[rollback] tráfico en $target"
}

cmd_retire() {
    local active other
    active="$(active_colour)"
    other="$(other_colour "$active")"
    [[ -z "$other" ]] && { echo "[retire] no sé qué color sirve" >&2; return 1; }
    echo "[retire] apagando $other (sirviendo: $active)"
    compose stop "core-api-$other"
    # The fallback just disappeared, and the console should say so rather than
    # keep showing a rollback that would no longer work.
    record_state
}

main() {
    cd "$COMPOSE_DIR" 2>/dev/null || true
    seed_upstream
    case "${1:-status}" in
        deploy)   shift; cmd_deploy "$@" ;;
        rollback) cmd_rollback ;;
        retire)   cmd_retire ;;
        status)   cmd_status ;;
        *) echo "uso: deploy_switch.sh {deploy <tag>|rollback|retire|status}" >&2; return 2 ;;
    esac
}

# Only run when executed, not when sourced by the test.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
