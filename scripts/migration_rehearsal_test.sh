#!/usr/bin/env bash
#
# Tests for migration_rehearsal.sh.
#
# Este script hace dos cosas peligrosas de forma desatendida dentro de un
# despliegue: decide si una migración puede tocar producción, y borra una base de
# datos. Las dos decisiones son puras y están aquí.
#
# La segunda es la que quita el sueño. Si una variable llega vacía o mal, un DROP
# cae sobre las historias clínicas de gente real, y no hay vuelta atrás que valga
# porque el respaldo se restaura en minutos y la sesión de esa tarde no.
#
set -euo pipefail

# shellcheck source=./migration_rehearsal.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/migration_rehearsal.sh"

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

echo "==> migration_rehearsal.sh el nombre de la base de ensayo"

check "el sufijo dice lo que es"       "sghcp_ensayo" "$(rehearsal_db_name sghcp)"
check "sin base real no hay nombre"    ""             "$(rehearsal_db_name '')"

echo "==> migration_rehearsal.sh la guarda del borrado"

check "la base de ensayo se puede borrar" \
    allow "$(drop_guard sghcp_ensayo sghcp)"

# Las cinco formas en que esto podría llevarse producción por delante.
check "la base real NUNCA se borra" \
    refuse-is-production "$(drop_guard sghcp sghcp)"
check "un nombre vacío no borra nada" \
    refuse-empty "$(drop_guard '' sghcp)"
check "sin saber cuál es la real, no se borra nada" \
    refuse-no-reference "$(drop_guard sghcp_ensayo '')"
check "una base cualquiera no se borra" \
    refuse-not-the-rehearsal "$(drop_guard postgres sghcp)"
check "ni una que se le parezca" \
    refuse-not-the-rehearsal "$(drop_guard sghcp_ensayo_viejo sghcp)"

# Con las dos variables vacías, el nombre de ensayo calculado también sería
# vacío, así que un guardián descuidado diría que coinciden y autorizaría.
check "todo vacío tampoco autoriza" \
    refuse-empty "$(drop_guard '' '')"

echo "==> migration_rehearsal.sh el veredicto del ensayo"

check "migración limpia sobre la copia"    ok        "$(rehearsal_verdict 0 f 80)"
check "migrate en rojo es un fallo"        failed    "$(rehearsal_verdict 1 f 80)"

# El caso que da nombre a todo esto: golang-migrate deja dirty=true cuando una
# migración se rompe a la mitad, y se niega a seguir hasta que un humano lo
# resuelva. Verlo aquí, sobre la copia, es exactamente el punto.
check "una migración a medias sobre la copia detiene el despliegue" \
    dirty "$(rehearsal_verdict 0 t 80)"

check "no poder leer dirty no es un aprobado"    unreadable "$(rehearsal_verdict 0 '' 80)"
check "una versión ilegible no es un aprobado"   unreadable "$(rehearsal_verdict 0 f '')"
check "una versión que no es número tampoco"     unreadable "$(rehearsal_verdict 0 f ochenta)"

if [[ "$failures" -ne 0 ]]; then
    echo
    echo "migration_rehearsal.sh está mal. Arréglalo — no aflojes un caso: uno de"
    echo "ellos es lo único que separa un DROP de las historias clínicas reales."
    exit 1
fi
echo "==> migration_rehearsal.sh ok"
