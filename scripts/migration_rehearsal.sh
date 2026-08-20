#!/usr/bin/env bash
#
# migration_rehearsal.sh — correr la migración sobre una copia antes de correrla
# sobre las historias clínicas de alguien.
#
# Hasta hoy la primera vez que una migración tocaba datos reales era en
# producción. Las migraciones son aditivas por regla, lo que cubre el caso de
# esquema, pero no cubre un backfill con un UPDATE mal filtrado — y ése no
# fracasa ruidosamente: termina bien, deja la base en un estado que nadie pidió,
# y se descubre días después cuando una psicóloga dice que un dato está raro.
#
# El ensayo usa la copia que predeploy_dump.sh acaba de tomar, la restaura en una
# base desechable DENTRO del mismo Postgres — sin un contenedor más, sin un byte
# más de RAM — corre `migrate up` ahí, y solo si sale limpia se migra la de
# verdad. Los datos nunca salen del servidor.
#
# El VPS es un CX21 con 1,9 GB. Esa es la razón de que el ensayo viva en una base
# desechable y no en un entorno de staging: no cabe uno, y para esta pregunta no
# hace falta.
set -uo pipefail

MIGRATIONS_DIR="${MIGRATIONS_DIR:-/root/clinic-system/services/core-api/migrations}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-sghcp_postgres}"

# ── pure ────────────────────────────────────────────────────────────────────

# rehearsal_db_name <nombre de la base real>
# Un sufijo, no un prefijo: quien lea `\l` en una consola ve las dos juntas y la
# de ensayo dice lo que es al final del nombre, donde el ojo termina de leer.
rehearsal_db_name() {
    [[ -z "$1" ]] && { echo ""; return; }
    printf '%s_ensayo\n' "$1"
}

# drop_guard <base que se va a borrar> <base real>
#
# La función más importante de este fichero. El ensayo termina borrando una base
# de datos, y este script corre desatendido dentro de un despliegue. Si una
# variable llegara vacía o mal, el DROP caería sobre las historias clínicas de
# gente real. Así que el borrado se autoriza aquí, explícitamente, y todo lo que
# no sea exactamente la base de ensayo se rechaza.
drop_guard() {
    local target="$1" real="$2"
    [[ -z "$target" ]] && { echo refuse-empty; return; }
    [[ -z "$real" ]] && { echo refuse-no-reference; return; }
    [[ "$target" == "$real" ]] && { echo refuse-is-production; return; }
    [[ "$target" != "$(rehearsal_db_name "$real")" ]] && { echo refuse-not-the-rehearsal; return; }
    echo allow
}

# rehearsal_verdict <salida de migrate> <valor de dirty> <versión resultante>
# Un `migrate up` sin nada pendiente imprime "no change" y sale 0, así que salir
# 0 es necesario y no suficiente: lo que decide es que la fila de control quede
# limpia y con una versión legible.
rehearsal_verdict() {
    local status="$1" dirty="$2" version="$3"
    [[ "$status" -ne 0 ]] && { echo failed; return; }
    [[ "$dirty" == "t" ]] && { echo dirty; return; }
    [[ "$dirty" != "f" ]] && { echo unreadable; return; }
    [[ ! "$version" =~ ^[0-9]+$ ]] && { echo unreadable; return; }
    echo ok
}

# ── the world ───────────────────────────────────────────────────────────────

psql_real() { docker exec -i "$POSTGRES_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -tAc "$1"; }
psql_in()   { docker exec -i "$POSTGRES_CONTAINER" psql -U "$DB_USER" -d "$1" -tAc "$2"; }

drop_rehearsal() { # drop_rehearsal <nombre>
    local target="$1" verdict
    verdict="$(drop_guard "$target" "$DB_NAME")"
    if [[ "$verdict" != allow ]]; then
        echo "::error::me niego a borrar '$target' ($verdict)"
        return 1
    fi
    psql_real "DROP DATABASE IF EXISTS \"$target\" WITH (FORCE)" >/dev/null 2>&1
}

main() {
    local dump="${1:-}"
    if [[ -z "$dump" || ! -f "$dump" ]]; then
        echo "::error::uso: migration_rehearsal.sh <ruta del dump>"
        return 1
    fi

    local db
    db="$(rehearsal_db_name "$DB_NAME")"
    [[ -z "$db" ]] && { echo "::error::DB_NAME vacío"; return 1; }

    echo "[ensayo] preparando '$db' desde $(basename "$dump")"
    drop_rehearsal "$db" || return 1
    psql_real "CREATE DATABASE \"$db\"" >/dev/null || {
        echo "::error::no pude crear la base de ensayo"; return 1; }

    # Restaurar. ON_ERROR_STOP=0 porque el dump trae GRANTs a roles que no
    # existen en una base recién creada, y eso no invalida el ensayo: lo que se
    # está probando es la migración, no los permisos.
    if ! gunzip -c "$dump" | docker exec -i "$POSTGRES_CONTAINER" \
            psql -q -U "$DB_USER" -d "$db" -v ON_ERROR_STOP=0 >/dev/null 2>&1; then
        echo "::error::no pude restaurar la copia en la base de ensayo"
        drop_rehearsal "$db"
        return 1
    fi

    echo "[ensayo] corriendo las migraciones sobre la copia"
    docker run --rm \
        -v "$MIGRATIONS_DIR:/migrations" \
        --network "container:$POSTGRES_CONTAINER" \
        migrate/migrate \
        -path=/migrations/ \
        -database "postgres://$DB_USER:$DB_PASSWORD@localhost:5432/$db?sslmode=disable" \
        up
    local status=$?

    local dirty version verdict
    dirty="$(psql_in "$db" 'SELECT dirty FROM schema_migrations' 2>/dev/null | tr -d '[:space:]')"
    version="$(psql_in "$db" 'SELECT version FROM schema_migrations' 2>/dev/null | tr -d '[:space:]')"
    verdict="$(rehearsal_verdict "$status" "$dirty" "$version")"

    drop_rehearsal "$db"

    if [[ "$verdict" != ok ]]; then
        echo "::error::el ensayo de migración falló ($verdict, migrate=$status, dirty=$dirty, version=$version)."
        echo "El despliegue se detiene ANTES de tocar la base real. Esa migración habría"
        echo "fallado igual sobre las historias clínicas de producción."
        return 1
    fi
    echo "[ensayo] limpio — la migración llega a la versión $version sobre datos reales"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
