#!/bin/sh
set -eu

BACKUP_DIR="${BACKUP_DIR:-/backups}"
BACKUP_RETENTION="${BACKUP_RETENTION:-7}"
BACKUP_INTERVAL_HOURS="${BACKUP_INTERVAL_HOURS:-24}"
POSTGRES_HOST="${POSTGRES_HOST:-postgres}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_DB="${POSTGRES_DB:-lumi}"
POSTGRES_USER="${POSTGRES_USER:-lumi}"

export PGPASSWORD="${POSTGRES_PASSWORD:-lumi}"

run_backup() {
    ts="$(date -u +%Y%m%dT%H%M%SZ)"
    dest="${BACKUP_DIR}/lumi-${ts}.dump"
    tmp="${dest}.tmp"

    echo "[backup] starting dump to ${dest}"
    pg_dump -Fc \
        -h "${POSTGRES_HOST}" \
        -p "${POSTGRES_PORT}" \
        -U "${POSTGRES_USER}" \
        -d "${POSTGRES_DB}" \
        -f "${tmp}"
    mv "${tmp}" "${dest}"
    echo "[backup] wrote ${dest}"

    prune_old
}

prune_old() {
    count="$(find "${BACKUP_DIR}" -maxdepth 1 -name 'lumi-*.dump' -type f | wc -l)"
    if [ "${count}" -le "${BACKUP_RETENTION}" ]; then
        return 0
    fi

    excess="$((count - BACKUP_RETENTION))"
    find "${BACKUP_DIR}" -maxdepth 1 -name 'lumi-*.dump' -type f | sort | head -n "${excess}" | while IFS= read -r old; do
        echo "[backup] pruning ${old}"
        rm -f "${old}"
    done
}

mkdir -p "${BACKUP_DIR}"

case "${1:-loop}" in
    once)
        run_backup
        ;;
    loop)
        while true; do
            run_backup
            sleep "$((BACKUP_INTERVAL_HOURS * 3600))"
        done
        ;;
    *)
        echo "usage: $0 [once|loop]" >&2
        exit 1
        ;;
esac
