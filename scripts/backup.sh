#!/usr/bin/env bash
# backup.sh — pg_dump diario cifrado con GPG + sincronización a Backblaze B2
# Ejecutado por cron: 0 2 * * * /opt/sghcp/scripts/backup.sh
# Requiere: docker, gpg, rclone (configurado con B2 como remote "b2")

set -euo pipefail

ENV_FILE="${ENV_FILE:-/etc/sghcp/.env}"
if [[ -f "$ENV_FILE" ]]; then
    # shellcheck disable=SC1090
    set -a; source "$ENV_FILE"; set +a
fi

: "${DB_NAME:?DB_NAME not set}"
: "${DB_USER:?DB_USER not set}"
: "${GPG_RECIPIENT:?GPG_RECIPIENT not set}"
: "${B2_BUCKET_NAME:?B2_BUCKET_NAME not set}"

BACKUP_DIR="${DATA_DIR:-/data}/backups"
DATE=$(date +%Y-%m-%d)
FILENAME="sghcp-${DATE}.sql.gz.gpg"
DEST="${BACKUP_DIR}/${FILENAME}"

mkdir -p "$BACKUP_DIR"

echo "[backup] Starting pg_dump for ${DB_NAME} at $(date -u +%T) UTC"

# Dump → gzip → GPG encrypt in a single pipeline (never writes plaintext to disk)
docker exec sghcp_postgres pg_dump \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    --no-password \
    --format=plain \
    --no-owner \
    --no-privileges \
    | gzip -9 \
    | gpg --batch --yes --recipient "$GPG_RECIPIENT" --encrypt \
    > "$DEST"

SIZE=$(du -sh "$DEST" | cut -f1)
echo "[backup] Backup written: ${DEST} (${SIZE})"

# Validate: the file must be non-empty and GPG-parseable
if ! gpg --batch --list-packets "$DEST" > /dev/null 2>&1; then
    echo "[backup] ERROR: GPG validation failed for ${DEST}" >&2
    rm -f "$DEST"
    exit 1
fi

# Sync to Backblaze B2
echo "[backup] Uploading to B2 bucket ${B2_BUCKET_NAME}..."
rclone copy "$DEST" "b2:${B2_BUCKET_NAME}/daily/"

echo "[backup] Upload complete at $(date -u +%T) UTC"

# Clean up local backups older than 7 days (B2 retains for 15 years via lifecycle rule)
find "$BACKUP_DIR" -name "*.gpg" -mtime +7 -delete

echo "[backup] Done"
