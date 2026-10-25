#!/bin/bash
# Lumi v2 Restore Script
# Usage: ./restore.sh [postgres|redis] [backup-file]

set -euo pipefail

RESTORE_TARGET="${1:-postgres}"
BACKUP_FILE="${2}"

# Load environment
if [[ -f /etc/lumi.env ]]; then
  source /etc/lumi.env
elif [[ -f .env ]]; then
  source .env
fi

# Default values
DB_HOST="${DATABASE_HOST:-localhost}"
DB_PORT="${DATABASE_PORT:-5432}"
DB_NAME="${DATABASE_NAME:-lumi}"
DB_USER="${DATABASE_USER:-lumi}"
DB_PASSWORD="${DATABASE_PASSWORD}"

REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"
REDIS_PASSWORD="${REDIS_PASSWORD}"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

error() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $*" >&2
  exit 1
}

confirm() {
  local prompt="$1"
  read -p "${prompt} (y/N): " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    error "Restore cancelled"
  fi
}

restore_postgres() {
  local file="${BACKUP_FILE}"
  
  if [[ ! -f "${file}" ]]; then
    error "Backup file not found: ${file}"
  fi
  
  log "Restoring PostgreSQL from ${file}"
  
  # Confirm before proceeding
  confirm "This will OVERWRITE the database '${DB_NAME}'. Are you sure?"
  
  # Terminate existing connections
  log "Terminating existing connections"
  PGPASSWORD="${DB_PASSWORD}" psql \
    -h "${DB_HOST}" \
    -p "${DB_PORT}" \
    -U "${DB_USER}" \
    -d postgres \
    -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();" \
    || true
  
  # Drop and recreate database
  log "Dropping and recreating database"
  PGPASSWORD="${DB_PASSWORD}" psql \
    -h "${DB_HOST}" \
    -p "${DB_PORT}" \
    -U "${DB_USER}" \
    -d postgres \
    -c "DROP DATABASE IF EXISTS \"${DB_NAME}\"; CREATE DATABASE \"${DB_NAME}\" OWNER \"${DB_USER}\";" \
    || error "Failed to recreate database"
  
  # Restore based on file type
  if [[ "${file}" == *.custom ]]; then
    log "Restoring from custom format dump"
    PGPASSWORD="${DB_PASSWORD}" pg_restore \
      -h "${DB_HOST}" \
      -p "${DB_PORT}" \
      -U "${DB_USER}" \
      -d "${DB_NAME}" \
      --verbose \
      --no-password \
      --jobs=4 \
      "${file}" \
      || error "pg_restore failed"
  elif [[ "${file}" == *.sql.gz ]]; then
    log "Restoring from compressed SQL dump"
    gunzip -c "${file}" | PGPASSWORD="${DB_PASSWORD}" psql \
      -h "${DB_HOST}" \
      -p "${DB_PORT}" \
      -U "${DB_USER}" \
      -d "${DB_NAME}" \
      --quiet \
      || error "psql restore failed"
  elif [[ "${file}" == *.sql ]]; then
    log "Restoring from SQL dump"
    PGPASSWORD="${DB_PASSWORD}" psql \
      -h "${DB_HOST}" \
      -p "${DB_PORT}" \
      -U "${DB_USER}" \
      -d "${DB_NAME}" \
      --quiet \
      -f "${file}" \
      || error "psql restore failed"
  else
    error "Unknown backup file format: ${file}"
  fi
  
  # Run migrations to ensure schema is up to date
  log "Running database migrations"
  cd /app && bun run db:migrate deploy || error "Migrations failed"
  
  log "PostgreSQL restore completed successfully"
}

restore_redis() {
  local file="${BACKUP_FILE}"
  
  if [[ ! -f "${file}" ]]; then
    error "Backup file not found: ${file}"
  fi
  
  log "Restoring Redis from ${file}"
  
  confirm "This will OVERWRITE all Redis data. Are you sure?"
  
  # Stop Redis writes
  log "Stopping Redis writes"
  if [[ -n "${REDIS_PASSWORD}" ]]; then
    redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" -a "${REDIS_PASSWORD}" CONFIG SET stop-writes-on-bgsave-error no
  else
    redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" CONFIG SET stop-writes-on-bgsave-error no
  fi
  
  # Flush all data
  log "Flushing existing Redis data"
  if [[ -n "${REDIS_PASSWORD}" ]]; then
    redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" -a "${REDIS_PASSWORD}" FLUSHALL
  else
    redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" FLUSHALL
  fi
  
  # Restore from RDB file
  log "Restoring from RDB file"
  if [[ -n "${REDIS_PASSWORD}" ]]; then
    redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" -a "${REDIS_PASSWORD}" --pipe < "${file}" || error "Redis restore failed"
  else
    redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" --pipe < "${file}" || error "Redis restore failed"
  fi
  
  # Verify restore
  log "Verifying restore"
  local key_count
  if [[ -n "${REDIS_PASSWORD}" ]]; then
    key_count=$(redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" -a "${REDIS_PASSWORD}" DBSIZE)
  else
    key_count=$(redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" DBSIZE)
  fi
  
  log "Redis restore completed. Keys restored: ${key_count}"
}

# Download from S3 if needed
download_from_s3() {
  local s3_path="$1"
  local local_path="$2"
  local s3_bucket="${BACKUP_S3_BUCKET:-lumi-backups}"
  
  if [[ -z "${AWS_ACCESS_KEY_ID}" ]]; then
    error "AWS credentials not configured"
  fi
  
  log "Downloading from s3://${s3_bucket}/${s3_path}"
  aws s3 cp "s3://${s3_bucket}/${s3_path}" "${local_path}" || error "S3 download failed"
}

main() {
  if [[ -z "${BACKUP_FILE}" ]]; then
    error "Usage: $0 [postgres|redis] [backup-file|s3://path]"
  fi
  
  local file="${BACKUP_FILE}"
  
  # Check if it's an S3 path
  if [[ "${file}" == s3://* ]]; then
    local s3_path="${file#s3://}"
    local local_file="/tmp/$(basename "${s3_path}")"
    download_from_s3 "${s3_path}" "${local_file}"
    file="${local_file}"
  fi
  
  case "${RESTORE_TARGET}" in
    postgres)
      restore_postgres "${file}"
      ;;
    redis)
      restore_redis "${file}"
      ;;
    *)
      error "Unknown restore target: ${RESTORE_TARGET}. Use 'postgres' or 'redis'"
      ;;
  esac
  
  log "Restore completed successfully"
}

main "$@"