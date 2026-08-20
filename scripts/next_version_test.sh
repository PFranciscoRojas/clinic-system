#!/usr/bin/env bash
#
# Tests for next_version.sh.
#
# El motivo de que este cálculo exista: las etiquetas anteriores de este repo se
# abandonaron porque poner el número era un acto humano por despliegue. Éste se
# deriva, así que lo único que puede fallar es la aritmética — y una versión mal
# calculada es peor que ninguna, porque nombra a un build que no existe y manda
# a un operador a volver a algo que no está.
#
set -euo pipefail

# shellcheck source=./next_version.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/next_version.sh"

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

echo "==> next_version.sh leyendo una etiqueta"

check "una versión con v se parte en tres"    "0 9 0"   "$(parse_tag v0.9.0)"
check "y sin la v también"                    "0 9 0"   "$(parse_tag 0.9.0)"
check "los números grandes no se truncan"     "12 34 56" "$(parse_tag v12.34.56)"

# Falla en cerrado. Inventar un número a partir de algo que no se entiende
# nombra a un build inexistente, y ahí es donde un rollback se va a la nada.
check "una etiqueta que no es versión no da nada" "" "$(parse_tag v0.9)"
check "una etiqueta de texto no da nada"          "" "$(parse_tag beta)"
check "una versión con sufijo no da nada"         "" "$(parse_tag v0.9.0-rc1)"
check "vacío no da nada"                          "" "$(parse_tag '')"

echo "==> next_version.sh componiendo el número"

check "sin commits encima, la versión es la etiqueta" \
    v0.9.0 "$(compose_version v0.9.0 0)"
check "tres commits encima suben el patch a 3" \
    v0.9.3 "$(compose_version v0.9.0 3)"

# El patch cuenta, no se acarrea: nueve más una no son diez punto cero. Subir el
# minor es una decisión humana, y confundir las dos cosas convertiría un cambio
# corriente en el anuncio de que hay algo que contar.
check "el patch no se acarrea al minor" \
    v0.9.10 "$(compose_version v0.9.9 1)"

# Etiquetar a mano reinicia la cuenta sin ningún caso especial.
check "una etiqueta manual con patch propio suma encima de ella" \
    v0.10.2 "$(compose_version v0.10.0 2)"
check "y si la etiqueta manual ya traía patch, se suma igual" \
    v1.2.7 "$(compose_version v1.2.5 2)"

check "una etiqueta ilegible no compone nada"  "" "$(compose_version beta 3)"
check "un conteo ilegible no compone nada"     "" "$(compose_version v0.9.0 x)"
check "un conteo negativo no compone nada"     "" "$(compose_version v0.9.0 -1)"

if [[ "$failures" -ne 0 ]]; then
    echo
    echo "next_version.sh está mal. Arregla el script — no aflojes un caso: una"
    echo "versión mal calculada nombra un build que no existe."
    exit 1
fi
echo "==> next_version.sh ok"
