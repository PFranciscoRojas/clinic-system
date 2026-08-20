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

echo "==> deploy_switch.sh did the switch actually land"

# 2026-08-20, found before it bit anyone. caddy-upstream.conf is bind-mounted
# into the container as a single file, which Docker pins by inode. The script
# wrote the new colour with the usual atomic rename — and a rename creates a new
# inode, so the host had the new file while Caddy kept reading the old one.
# `caddy reload` parsed what it could see, accepted it, and exited 0. The traffic
# would have stayed on the old colour with every log line saying the deploy
# worked.
#
# So the exit code of a reload is not evidence. These cases pin the only reading
# that is: what Caddy reports from inside the container.
check "asked for green and Caddy says green" \
    applied "$(apply_verdict green green)"
check "asked for green and Caddy still says blue is a stale mount, not a success" \
    stale "$(apply_verdict green blue)"
check "asked for blue and Caddy still says green is stale too" \
    stale "$(apply_verdict blue green)"
check "a container we cannot read from is not a success either" \
    unreadable "$(apply_verdict green '')"

echo "==> deploy_switch.sh what it writes down for the console"

# The console cannot see Docker and must not — giving the application the
# socket is what PR #107 removed. So the host writes down what it knows, and
# these are the readings the console will show.
check "a SHA tag is the build"        bcfc0b5 "$(image_sha ghcr.io/x/core-api:bcfc0b5)"
check "latest names no build in particular" \
    latest "$(image_sha ghcr.io/x/core-api:latest)"
check "an image with no tag yields nothing" \
    "" "$(image_sha ghcr.io/x/core-api)"
check "no image at all yields nothing"  "" "$(image_sha '')"

# A registry with a port in it has a colon that is not the tag separator. Cutting
# at the first colon would report "5000/x/core-api:abc" as the build.
check "a registry port is not mistaken for a tag" \
    abc123 "$(image_sha localhost:5000/x/core-api:abc123)"

# And the same reference with no tag at all. Everything after the last colon is
# "5000/x/core-api", which is a path, not a build — a tag never contains a slash.
check "a registry port with no tag yields nothing, not the port" \
    "" "$(image_sha localhost:5000/x/core-api)"

check "a state line carries everything the console needs" \
    "1787000000|green|bcfc0b5|blue|12d6fd0|running" \
    "$(state_line 1787000000 green bcfc0b5 blue 12d6fd0 running)"

# A retired fallback must be visible as such. A console that keeps offering a
# rollback that would no longer work is worse than one that offers none.
check "a retired fallback is recorded as not running" \
    "1787000000|green|bcfc0b5|blue|12d6fd0|exited" \
    "$(state_line 1787000000 green bcfc0b5 blue 12d6fd0 exited)"

check "a history line is a build you can still go back to" \
    "1787000000|green|bcfc0b5|v0.9.3|fix(billing): que quien ya pagó pueda reintentar" \
    "$(history_line 1787000000 green bcfc0b5 v0.9.3 "fix(billing): que quien ya pagó pueda reintentar")"

# El asunto va al final porque puede traer el separador. Si se colara a mitad,
# el lector partiría la línea por el sitio equivocado y el historial mostraría
# basura justo cuando alguien lo está leyendo para decidir a qué volver.
check "un asunto con el separador no parte la línea" \
    "1787000000|green|bcfc0b5|v0.9.3|feat: a   b   c" \
    "$(history_line 1787000000 green bcfc0b5 v0.9.3 "feat: a | b | c")"

# Un mensaje de commit es texto que controla quien abre el PR. Aquí solo se
# guarda, pero un salto de línea partiría el fichero en dos entradas.
check "un asunto con salto de línea sigue siendo una sola línea" \
    "1787000000|green|bcfc0b5|v0.9.3|feat: uno dos" \
    "$(history_line 1787000000 green bcfc0b5 v0.9.3 "feat: uno
dos")"

check "un rollback puede no traer versión y la línea sigue siendo válida" \
    "1787000000|blue|639aa2d||vuelta atrás" \
    "$(history_line 1787000000 blue 639aa2d "" "vuelta atrás")"

echo "==> deploy_switch.sh cuándo NO hay que desplegar"

# Con la ventana nocturna el despliegue corre por horario, así que la mayoría de
# las noches no habrá nada nuevo. Volver a desplegar lo mismo no es inofensivo:
# retire apaga la reserva y el ciclo levanta la MISMA versión, o sea que se
# pierde el punto de retorno a cambio de nada.
check "una versión nueva se despliega" \
    deploy "$(deploy_needed 639aa2d bcfc0b5)"
check "la misma versión que ya sirve NO se despliega" \
    skip-same "$(deploy_needed 639aa2d 639aa2d)"
check "sin nada sirviendo, se despliega" \
    deploy "$(deploy_needed '' bcfc0b5)"
check "sin candidato no se despliega nada" \
    abort-no-candidate "$(deploy_needed 639aa2d '')"

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
