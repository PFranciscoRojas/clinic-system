#!/usr/bin/env bash
#
# Tests for monitor.sh's reading of production.
#
# On 2026-08-18 a psychologist paid for her subscription and stayed locked out
# of her own consulting room for the rest of the day. Every instrument on the
# box said the system was fine, and every instrument was telling the truth: the
# containers were up, the disk was empty, /healthz answered 200 within
# milliseconds. What was broken was the one thing nothing measured, which was
# whether she could get in.
#
# So these cases are about the reading, not the reaching. The checks themselves
# make network calls and nothing here can test those. What is testable is what
# a monitor concludes from what came back, and whether that conclusion reaches a
# human — the two places where an outage becomes invisible without anybody
# writing a line of code that looks wrong.
#
set -euo pipefail

# shellcheck source=./monitor.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/monitor.sh"

failures=0

check() {
    local name="$1" want="$2" got="$3"
    if [[ "$got" == "$want" ]]; then
        printf '  ok    %s\n' "$name"
    else
        printf '  FAIL  %s — want %s, got %s\n' "$name" "$want" "$got"
        failures=1
    fi
}

echo "==> monitor.sh entry probe"

check "a working consulting room reads as ok" \
    ok "$(probe_verdict 200 200 200 200)"

# The incident, pinned. Before this script existed, this exact combination of
# codes was what production looked like all afternoon, and it was indistinguish-
# able from health because nothing asked the last question.
check "healthz 200 and a 402 workspace is NOT ok" \
    locked-out "$(probe_verdict 200 200 200 402)"

# The canary is a professional in the internal demo organization, whose
# subscription runs to 2099. There is no reading of a 402 there that means
# anything other than the gate turning away somebody who has paid.
check "the lockout keeps its own name" \
    locked-out "$(probe_verdict 200 200 200 402)"

check "a dead process is api-down" \
    api-down "$(probe_verdict 502 000 000 000)"

check "wrong credentials are login-broken" \
    login-broken "$(probe_verdict 200 401 000 000)"

check "a rejected token is session-broken" \
    session-broken "$(probe_verdict 200 200 401 000)"

check "a 500 on the workspace is not the lockout" \
    workspace-broken "$(probe_verdict 200 200 200 500)"

# curl reports 000 when it never got an answer at all. Silence is not a status
# code, and it must not fall through to whatever branch happens to be last.
check "no answer at all is unreachable" \
    unreachable "$(probe_verdict 000 000 000 000)"

check "silence anywhere in the sequence is unreachable" \
    unreachable "$(probe_verdict 200 200 000 200)"

echo "==> monitor.sh tasa de errores"

# El hueco que tapa: la sonda de entrada pregunta si se puede entrar, y se puede
# entrar perfectamente mientras el guardado de una historia clínica devuelve 500
# una vez de cada tres. Ese fallo llegaba por WhatsApp de la usuaria, días
# después, si se animaba a escribir.
check "sin errores es ok"                     ok      "$(error_rate_verdict 0 120 3)"
check "sin tráfico ninguno tampoco es fallo"  ok      "$(error_rate_verdict 0 0 3)"
check "en el umbral se avisa"                 failing "$(error_rate_verdict 3 120 3)"
check "por encima del umbral también"         failing "$(error_rate_verdict 40 120 3)"

# Un 500 aislado no despierta a nadie. Un aviso por cada error suelto enseña a
# ignorar los avisos, y entonces el canal deja de servir para el que importa.
check "uno suelto no despierta a nadie"       ok      "$(error_rate_verdict 1 120 3)"
check "dos tampoco, con el umbral en tres"    ok      "$(error_rate_verdict 2 120 3)"

# Todos los errores y ninguna petición buena: el caso más grave, y el que un
# recuento por porcentaje podría dejar pasar por falta de volumen.
check "todo roto con poco tráfico sí avisa"   failing "$(error_rate_verdict 4 4 3)"

# No poder contar no es lo mismo que contar cero. Un recuento ilegible leído
# como silencio es exactamente la clase de ceguera que este monitor existe para
# no volver a tener.
check "un recuento ilegible no es silencio"   unknown "$(error_rate_verdict x 120 3)"
check "un total ilegible tampoco"             unknown "$(error_rate_verdict 0 x 3)"

echo "==> monitor.sh disk"

check "an empty disk is ok"    ok   "$(disk_verdict 22 80)"
check "a full disk is full"    full "$(disk_verdict 91 80)"

# 80 is the number we said we would act on. A check that waits for 81 has
# quietly moved the threshold it claims to enforce.
check "exactly at the threshold alerts" full "$(disk_verdict 80 80)"
check "one below stays quiet"           ok   "$(disk_verdict 79 80)"

# df failed, or printed something unexpected. Reading that as 0% is how a disk
# fills up under a green dashboard.
check "an unreadable disk is not an empty one" \
    unknown "$(disk_verdict "" 80)"

echo "==> monitor.sh AI queue"

check "an idle queue is ok" ok "$(queue_verdict 0 x 1200)"

# Pending is normal — a job is pending from pickup to acknowledgement. Only the
# clock makes it an alarm.
check "a job in progress is ok"      ok    "$(queue_verdict 2 30 1200)"
check "a job past the cap is stuck"  stuck "$(queue_verdict 1 1800 1200)"
check "exactly at the cap is stuck"  stuck "$(queue_verdict 1 1200 1200)"

check "an unreadable queue is not an empty one" \
    unknown "$(queue_verdict x x 1200)"

# Something is pending and we could not read how long for. Calling that ok is
# the same mistake as calling an unreadable disk empty, one layer down.
check "pending work with no clock is unknown" \
    unknown "$(queue_verdict 3 x 1200)"

echo "==> monitor.sh worker liveness"

check "no lag is ok" ok "$(lag_verdict 0 100-0 100-0)"

# The failure mode where every container is healthy and audio silently stops
# becoming clinical notes: work arrives, the worker never reads it, and the
# last delivered id sits exactly where it was five minutes ago.
check "lag that has not moved is a stalled worker" \
    stalled "$(lag_verdict 4 100-0 100-0)"

check "lag that is being worked through is ok" \
    ok "$(lag_verdict 4 140-0 100-0)"

# First run after a reboot. One sample cannot tell a backlog from a stall, and
# an alarm invented from it teaches people to ignore the next one.
check "the first sample never alarms" \
    ok "$(lag_verdict 4 100-0 "")"

check "an unreadable lag is not zero lag" \
    unknown "$(lag_verdict x 100-0 100-0)"

echo "==> monitor.sh containers"

# `docker ps` prints name and status; the tests feed it the same two columns.
ps_line() { printf '%s\t%s\n' "$1" "$2"; }

check "everything up is ok" \
    ok "$( { ps_line a 'Up 3 weeks'; ps_line b 'Up 2 months (healthy)'; } | containers_verdict "a b")"

check "a missing container is named" \
    "down:b" "$(ps_line a 'Up 3 weeks' | containers_verdict "a b")"

check "several missing are all named" \
    "down:a b" "$(ps_line c 'Up 1 hour' | containers_verdict "a b")"

# docker itself is gone or the daemon is down: nothing is running, and the
# answer has to be every name, not silence.
check "nothing running names everything" \
    "down:a b c" "$(printf '' | containers_verdict "a b c")"

# A name that merely contains another must not satisfy it. sghcp_core_api and
# sghcp_core_api_old are different containers and only one of them serves
# traffic.
check "a partial name does not count as present" \
    "down:sghcp_core_api" \
    "$(ps_line sghcp_core_api_old 'Up 5 days' | containers_verdict "sghcp_core_api")"

# The case that motivated the whole file, one layer down: the container is
# listed, docker's own healthcheck says it is not answering, and a check that
# matched on the name would call that fine.
check "listed but unhealthy is not up" \
    "unhealthy:db" "$(ps_line db 'Up 4 minutes (unhealthy)' | containers_verdict "db")"

# Restarting is the crash loop `restart: unless-stopped` produces. It appears in
# `docker ps` exactly like something that is working.
check "a crash loop is down, not up" \
    "down:api" "$(ps_line api 'Restarting (1) 8 seconds ago' | containers_verdict "api")"

check "still starting is not yet up" \
    "down:api" "$(ps_line api 'Created' | containers_verdict "api")"

# Starting up, healthcheck not yet satisfied. Real and temporary — it reads as
# up, and the repeat window is what keeps a slow boot from paging anyone.
check "a container still warming up reads as up" \
    ok "$(ps_line db 'Up 9 seconds (health: starting)' | containers_verdict "db")"

check "both kinds of trouble are reported together" \
    "down:api unhealthy:db" \
    "$( { ps_line db 'Up 1 hour (unhealthy)'; } | containers_verdict "api db")"

echo "==> monitor.sh alerting"

# This is the part with no symptom when it is wrong. Too eager and the alarm
# becomes noise people filter; too quiet and an outage runs all night with
# nobody told. Neither shows up as a red test anywhere else.

check "a new failure is sent" \
    send "$(alert_decision ok 1000 2000 api-down 3600)"

check "the same failure a minute later is silent" \
    silent "$(alert_decision api-down 2000 2060 api-down 3600)"

check "the same failure an hour later is repeated" \
    repeat "$(alert_decision api-down 2000 5600 api-down 3600)"

check "coming back is worth an email" \
    recovered "$(alert_decision api-down 2000 2100 ok 3600)"

check "steady health says nothing" \
    nothing "$(alert_decision ok 2000 9999 ok 3600)"

# A different failure while one is already open. The silence window belongs to
# the old problem; charging this one for it is how "the database is gone" gets
# swallowed because the disk was already full.
check "a new kind of failure breaks the silence window" \
    send "$(alert_decision disk-full 2000 2060 api-down 3600)"

# First run ever: no state file, so no previous verdict and no send time. It
# must not read as "already told them".
check "the very first failure is sent" \
    send "$(alert_decision "" x 2000 api-down 3600)"

check "the very first ok is not a recovery" \
    nothing "$(alert_decision "" x 2000 ok 3600)"

echo "==> monitor.sh delivery"

# Verified against the live API on 2026-08-19: three alerts sent from the VPS
# and three arrived. What was missing was the other half — the script threw the
# answer away, so a rotated key or a suspended domain would have left it writing
# "told them" into the state file every five minutes with nobody told.

check "an accepted send is accepted" \
    yes "$(resend_accepted '{"id":"c5950e1c-5686-4e50-8166-b61fd4a6adbc"}')"

check "a rejected send is not" \
    no "$(resend_accepted '{"statusCode":401,"message":"API key is invalid","name":"validation_error"}')"

# curl got nothing at all: no network, no DNS, Resend down. Empty must not read
# as success, which is the direction this whole file leans.
check "no answer is not an accepted send" \
    no "$(resend_accepted '')"

# The word appears, but not as the field. A body that merely mentions an id is
# not a receipt for one.
check "the word id in prose is not a receipt" \
    no "$(resend_accepted '{"message":"missing id parameter"}')"

if [[ $failures -ne 0 ]]; then
    echo
    echo "The monitor is misreading production. It decides whether an outage"
    echo "reaches a human — do not loosen it to make this pass."
    exit 1
fi

echo "==> monitor.sh ok"
