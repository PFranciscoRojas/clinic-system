#!/usr/bin/env bash
#
# Tests for deploy_switch.sh's decisions.
#
# This script is the only thing standing between a broken build and the people
# using the system. It cannot be tested by reaching out — starting containers
# and reloading Caddy is exactly what must not happen here — but what it decides
# is pure, and that is where a deploy script goes wrong: it points traffic at a
# container that never came up, or it refuses to go back when going back is the
# whole point.
#
# The rule these cases defend: traffic moves only towards something that said,
# itself, that it is healthy. Everything else keeps the old version serving.
#
set -euo pipefail

# shellcheck source=./deploy_switch.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/deploy_switch.sh"

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

echo "==> deploy_switch.sh colours"

check "blue's other is green"            green "$(other_colour blue)"
check "green's other is blue"            blue  "$(other_colour green)"
check "an unknown colour has no other"   ""    "$(other_colour purple)"

echo "==> deploy_switch.sh reading which colour serves"

check "a blue upstream reads as blue" \
    blue "$(parse_active 'reverse_proxy core-api-blue:8080')"
check "a green upstream reads as green" \
    green "$(parse_active 'reverse_proxy core-api-green:8080')"
check "leading whitespace does not hide the directive" \
    green "$(parse_active '    reverse_proxy core-api-green:8080')"

# The file carries its own explanation. A comment that names the other colour
# must not be mistaken for the directive — otherwise editing the prose would
# silently move production.
check "a comment naming blue does not override a green directive" \
    green "$(parse_active '# was core-api-blue:8080 until today
reverse_proxy core-api-green:8080')"

check "an empty file yields no colour" "" "$(parse_active '')"
check "a file with no directive yields no colour" \
    "" "$(parse_active '# nothing here but prose')"

check "the line written for blue is the line read back as blue" \
    blue "$(parse_active "$(upstream_line blue)")"

echo "==> deploy_switch.sh reading a container's health"

check "healthy is ready"        ready   "$(health_verdict healthy 0 90)"
check "unhealthy fails at once" failed  "$(health_verdict unhealthy 3 90)"
check "starting keeps waiting"  waiting "$(health_verdict starting 30 90)"
check "starting past the deadline is a timeout" \
    timeout "$(health_verdict starting 90 90)"
check "no health section means the container is not there" \
    missing "$(health_verdict '' 0 90)"

echo "==> deploy_switch.sh the switch gate"

check "a healthy target takes the traffic" \
    switch "$(switch_decision blue green ready)"

# The reason this file exists. A container that failed its own probe must never
# receive traffic: the old version is still serving and still fine.
check "an unhealthy target does NOT take the traffic" \
    abort-unhealthy "$(switch_decision blue green failed)"
check "a target that never came up does NOT take the traffic" \
    abort-missing "$(switch_decision blue green missing)"
check "a target still starting past the deadline does NOT take the traffic" \
    abort-timeout "$(switch_decision blue green timeout)"

check "switching to the colour already serving is a no-op" \
    already-serving "$(switch_decision green green ready)"

# If the upstream file could not be read, active is empty and the target is
# empty too. Guessing here would point production at whatever is stale.
check "an unreadable upstream file aborts instead of guessing" \
    abort-unknown-target "$(switch_decision '' '' ready)"

echo "==> deploy_switch.sh going back"

check "going back is free while the old colour is up" \
    blue "$(rollback_target green running)"
check "going back to a retired colour is refused, not attempted" \
    abort-other-not-running "$(rollback_target green exited)"
check "going back to a colour that was never created is refused" \
    abort-other-not-running "$(rollback_target green '')"
check "going back from an unknown colour is refused" \
    abort-unknown-active "$(rollback_target '' running)"

if [[ "$failures" -ne 0 ]]; then
    echo
    echo "deploy_switch.sh is wrong. Fix the script — do not loosen a case to make"
    echo "this pass: each one is a way for a deploy to take production down."
    exit 1
fi
echo "==> deploy_switch.sh ok"
