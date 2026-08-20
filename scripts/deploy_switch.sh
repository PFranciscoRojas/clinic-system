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

point_caddy_at() { # point_caddy_at <colour>
    upstream_line "$1" > "$UPSTREAM_FILE.new"
    # Keep the explanation at the top of the file; only the directive changes.
    { sed -n '1,/^$/p' "$UPSTREAM_FILE" | grep -E '^#|^$'; cat "$UPSTREAM_FILE.new"; } > "$UPSTREAM_FILE.tmp"
    mv "$UPSTREAM_FILE.tmp" "$UPSTREAM_FILE"
    rm -f "$UPSTREAM_FILE.new"
    # reload parses and validates first: a bad config leaves the running one
    # in place instead of dropping the site.
    compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile
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
    echo "[rollback] tráfico en $target"
}

cmd_retire() {
    local active other
    active="$(active_colour)"
    other="$(other_colour "$active")"
    [[ -z "$other" ]] && { echo "[retire] no sé qué color sirve" >&2; return 1; }
    echo "[retire] apagando $other (sirviendo: $active)"
    compose stop "core-api-$other"
}

main() {
    cd "$COMPOSE_DIR" 2>/dev/null || true
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
