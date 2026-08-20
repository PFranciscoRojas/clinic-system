#!/usr/bin/env bash
#
# predeploy_dump.sh — a copy of the database taken seconds before a migration,
# not hours before.
#
# The daily backup runs at 02:00 and goes to Backblaze encrypted with a GPG key
# whose private half is deliberately NOT on this host: the box can encrypt its
# own backups and can never read them. That is the right shape for catastrophe —
# the server is gone, somebody restores from B2 with the offline key — and the
# wrong shape for the thing that actually goes wrong on a Tuesday, which is a
# migration with a bad backfill at four in the afternoon. Undoing that needs a
# copy this machine can read, and it needs it from four in the afternoon, not
# from two in the morning.
#
# So: a plain dump, on local disk, taken immediately before `migrate up`, kept
# for a week. If it cannot be taken, the deploy stops. A migration that touches
# data with no fresh copy behind it is the one operation on this system with no
# way back.
#
# On what is in it. Patient names, documents, phones, addresses and the whole
# clinical record are BYTEA encrypted with a per-patient DEK, and the DEKs
# themselves are encrypted with MASTER_KEY, which lives in .env and never in the
# database — so the dump alone does not open a single clinical note. But it is
# not innocuous: users.email is cleartext, and so are the bcrypt password hashes
# and patients' birth_date and gender. The argument for keeping it in the clear
# is narrower than "it is all encrypted anyway": it is that Postgres' own data
# directory, on this same disk, already holds exactly those columns in exactly
# that state. Whoever can read this file can read the database files next to it.
# What the file does add is a copy that outlives a DROP, which is why it is
# root-only, 0600, and swept after seven days.
set -uo pipefail

DUMP_DIR="${PREDEPLOY_DUMP_DIR:-/var/backups/sghcp/predeploy}"
KEEP_DAYS="${PREDEPLOY_KEEP_DAYS:-7}"
# A dump of this database gzips to a few hundred KB. Anything far below that is
# not a small database, it is a dump that produced nothing — which pg_dump can
# do while still exiting 0 if it is pointed at the wrong place.
MIN_BYTES="${PREDEPLOY_MIN_BYTES:-20000}"
CONTAINER="${POSTGRES_CONTAINER:-sghcp_postgres}"

# ── pure ────────────────────────────────────────────────────────────────────

# dump_verdict <pg_dump exit status> <bytes written> <floor>
# An exit status of 0 is necessary and not sufficient: pg_dump happily writes a
# valid, nearly empty file for a database that has nothing in it, and "nothing
# in it" is precisely the state we would be about to make permanent.
dump_verdict() {
    local status="$1" bytes="$2" floor="$3"
    [[ "$status" -ne 0 ]] && { echo failed; return; }
    [[ ! "$bytes" =~ ^[0-9]+$ ]] && { echo unreadable; return; }
    [[ "$bytes" -lt "$floor" ]] && { echo suspicious; return; }
    echo ok
}

# retention_verdict <file age in seconds> <keep days>
# Deliberately keeps anything it cannot date. Deleting a backup because its
# timestamp was unparseable is the wrong way round.
retention_verdict() {
    local age="$1" keep_days="$2"
    [[ ! "$age" =~ ^[0-9]+$ ]] && { echo keep; return; }
    if [[ "$age" -gt $(( keep_days * 86400 )) ]]; then echo delete; else echo keep; fi
}

# dump_name <timestamp> <ref> — what this copy is called and what it is of.
# The ref is in the filename because "restore the one from before the migration"
# is a question about a commit, not about a clock.
dump_name() {
    printf 'predeploy-%s-%s.sql.gz\n' "$1" "${2:-unknown}"
}

# ── the world ───────────────────────────────────────────────────────────────

main() {
    local ref="${1:-unknown}"
    mkdir -p "$DUMP_DIR" || return 1
    chmod 700 "$DUMP_DIR"

    local dest status bytes verdict
    dest="$DUMP_DIR/$(dump_name "$(date -u +%Y%m%d-%H%M%S)" "${ref:0:7}")"

    echo "[predeploy] copiando la base antes de migrar → $dest"
    docker exec "$CONTAINER" pg_dump \
        -U "$DB_USER" \
        -d "$DB_NAME" \
        --no-password \
        --format=plain \
        --no-owner \
        --no-privileges \
        | gzip -9 > "$dest"
    status="${PIPESTATUS[0]}"

    chmod 600 "$dest" 2>/dev/null
    bytes="$(stat -c %s "$dest" 2>/dev/null || echo x)"
    verdict="$(dump_verdict "$status" "$bytes" "$MIN_BYTES")"

    if [[ "$verdict" != ok ]]; then
        echo "::error::No se pudo copiar la base antes de migrar ($verdict, ${bytes}B, pg_dump=$status)."
        echo "El despliegue se detiene: migrar sin una copia fresca es la única"
        echo "operación de este sistema que no tiene vuelta atrás."
        rm -f "$dest"
        return 1
    fi
    echo "[predeploy] copia lista: $dest ($(numfmt --to=iec "$bytes" 2>/dev/null || echo "${bytes}B"))"

    # Sweep, after the new one is safely on disk and never before it.
    local f age
    for f in "$DUMP_DIR"/predeploy-*.sql.gz; do
        [[ -e "$f" ]] || continue
        age=$(( $(date +%s) - $(stat -c %Y "$f" 2>/dev/null || echo 0) ))
        if [[ "$(retention_verdict "$age" "$KEEP_DAYS")" == delete ]]; then
            echo "[predeploy] barriendo $(basename "$f") ($(( age / 86400 )) días)"
            rm -f "$f"
        fi
    done
}

# Only run when executed, not when sourced by the test.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
