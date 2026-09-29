#!/bin/sh
set -eu

BACKUP_DIR="${BACKUP_DIR:-/backups}"
POSTGRES_HOST="${POSTGRES_HOST:-postgres}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_USER="${POSTGRES_USER:-lumi}"

export PGPASSWORD="${POSTGRES_PASSWORD:-lumi}"

DUMP_FILE="${1:-}"
if [ -z "${DUMP_FILE}" ]; then
    DUMP_FILE="$(find "${BACKUP_DIR}" -maxdepth 1 -name 'lumi-*.dump' -type f | sort | tail -n 1)"
fi

if [ -z "${DUMP_FILE}" ] || [ ! -f "${DUMP_FILE}" ]; then
    echo "[restore-test] no dump file found (looked in ${BACKUP_DIR})" >&2
    exit 1
fi

TEST_DB="lumi_restore_test_$(date -u +%Y%m%dT%H%M%SZ)"

cleanup() {
    echo "[restore-test] dropping ${TEST_DB}"
    dropdb -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" -U "${POSTGRES_USER}" --if-exists "${TEST_DB}" || true
}
trap cleanup EXIT

echo "[restore-test] restoring ${DUMP_FILE} into ${TEST_DB}"
createdb -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" -U "${POSTGRES_USER}" "${TEST_DB}"

pg_restore --exit-on-error \
    -h "${POSTGRES_HOST}" \
    -p "${POSTGRES_PORT}" \
    -U "${POSTGRES_USER}" \
    -d "${TEST_DB}" \
    "${DUMP_FILE}"

migration_rows="$(psql -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" -U "${POSTGRES_USER}" -d "${TEST_DB}" -tAc \
    "SELECT count(*) FROM _prisma_migrations" 2>/dev/null || echo "")"

if [ -z "${migration_rows}" ]; then
    echo "[restore-test] FAILED: _prisma_migrations table not found in restored dump" >&2
    exit 1
fi

if [ "${migration_rows}" -eq 0 ]; then
    echo "[restore-test] FAILED: _prisma_migrations has no rows" >&2
    exit 1
fi

table_count="$(psql -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" -U "${POSTGRES_USER}" -d "${TEST_DB}" -tAc \
    "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'")"

echo "[restore-test] OK: ${migration_rows} applied migrations, ${table_count} tables in public schema"
