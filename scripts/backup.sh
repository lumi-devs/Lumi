#!/bin/bash
# Lumi v2 Backup Script
# Usage: ./backup.sh [full|incremental] [output-dir]

set -euo pipefail

BACKUP_TYPE="${1:-full}"
OUTPUT_DIR="${2:-/var/backups/lumi}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="lumi_${BACKUP_TYPE}_${TIMESTAMP}"

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

# Create output directory
mkdir -p "${OUTPUT_DIR}"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

error() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $*" >&2
  exit 1
}

# Check dependencies
check_deps() {
  for cmd in pg_dump pg_basebackup redis-cli aws; do
    if ! command -v "$cmd" &> /dev/null; then
      error "Required command '$cmd' not found"
    fi
  done
}

# Full PostgreSQL backup using pg_dump
backup_postgres_full() {
  local output_file="${OUTPUT_DIR}/${BACKUP_NAME}_postgres.sql.gz"
  
  log "Starting full PostgreSQL backup to ${output_file}"
  
  PGPASSWORD="${DB_PASSWORD}" pg_dump \
    -h "${DB_HOST}" \
    -p "${DB_PORT}" \
    -U "${DB_USER}" \
    -d "${DB_NAME}" \
    --verbose \
    --no-password \
    --format=custom \
    --compress=9 \
    --file="${output_file%.gz}.custom" \
    || error "pg_dump failed"
  
  # Also create SQL dump for readability
  PGPASSWORD="${DB_PASSWORD}" pg_dump \
    -h "${DB_HOST}" \
    -p "${DB_PORT}" \
    -U "${DB_USER}" \
    -d "${DB_NAME}" \
    --verbose \
    --no-password \
    --clean \
    --if-exists \
    | gzip -9 > "${output_file}"
  
  log "PostgreSQL backup completed: ${output_file}"
  echo "${output_file}"
}

# Incremental PostgreSQL backup using pg_basebackup
backup_postgres_incremental() {
  local backup_dir="${OUTPUT_DIR}/${BACKUP_NAME}_pg_basebackup"
  
  log "Starting incremental PostgreSQL backup to ${backup_dir}"
  
  PGPASSWORD="${DB_PASSWORD}" pg_basebackup \
    -h "${DB_HOST}" \
    -p "${DB_PORT}" \
    -U "${DB_USER}" \
    -D "${backup_dir}" \
    -Ft \
    -z \
    -P \
    -R \
    --wal-method=stream \
    || error "pg_basebackup failed"
  
  log "Incremental PostgreSQL backup completed: ${backup_dir}"
  echo "${backup_dir}"
}

# Redis backup using redis-cli
backup_redis() {
  local output_file="${OUTPUT_DIR}/${BACKUP_NAME}_redis.rdb"
  
  log "Starting Redis backup to ${output_file}"
  
  # Trigger BGSAVE
  if [[ -n "${REDIS_PASSWORD}" ]]; then
    redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" -a "${REDIS_PASSWORD}" BGSAVE
  else
    redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" BGSAVE
  fi
  
  # Wait for BGSAVE to complete
  while true; do
    if [[ -n "${REDIS_PASSWORD}" ]]; then
      LAST_SAVE=$(redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" -a "${REDIS_PASSWORD}" LASTSAVE)
    else
      LAST_SAVE=$(redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" LASTSAVE)
    fi
    sleep 1
    if [[ -n "${REDIS_PASSWORD}" ]]; then
      NEW_SAVE=$(redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" -a "${REDIS_PASSWORD}" LASTSAVE)
    else
      NEW_SAVE=$(redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" LASTSAVE)
    fi
    if [[ "${NEW_SAVE}" -gt "${LAST_SAVE}" ]]; then
      break
    fi
  done
  
  # Copy RDB file
  if [[ -n "${REDIS_PASSWORD}" ]]; then
    redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" -a "${REDIS_PASSWORD}" --rdb "${output_file}"
  else
    redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" --rdb "${output_file}"
  fi
  
  log "Redis backup completed: ${output_file}"
  echo "${output_file}"
}

# Upload to S3 (optional)
upload_to_s3() {
  local file="$1"
  local s3_bucket="${BACKUP_S3_BUCKET:-lumi-backups}"
  
  if [[ -z "${AWS_ACCESS_KEY_ID}" ]]; then
    log "AWS credentials not configured, skipping S3 upload"
    return
  fi
  
  log "Uploading ${file} to s3://${s3_bucket}/"
  aws s3 cp "${file}" "s3://${s3_bucket}/$(basename "${file}")" \
    --storage-class STANDARD_IA \
    || error "S3 upload failed"
  
  log "Uploaded to S3"
}

# Cleanup old backups
cleanup_old() {
  local retention_days="${BACKUP_RETENTION_DAYS:-30}"
  
  log "Cleaning up backups older than ${retention_days} days"
  
  find "${OUTPUT_DIR}" -type f -name "lumi_*" -mtime +${retention_days} -delete
  find "${OUTPUT_DIR}" -type d -name "lumi_*" -mtime +${retention_days} -exec rm -rf {} + 2>/dev/null || true
  
  log "Cleanup completed"
}

# Main
main() {
  log "Starting ${BACKUP_TYPE} backup"
  check_deps
  
  case "${BACKUP_TYPE}" in
    full)
      backup_postgres_full
      backup_redis
      ;;
    incremental)
      backup_postgres_incremental
      backup_redis
      ;;
    *)
      error "Unknown backup type: ${BACKUP_TYPE}. Use 'full' or 'incremental'"
      ;;
  esac
  
  # Upload all generated files to S3
  for file in "${OUTPUT_DIR}/${BACKUP_NAME}"*; do
    [[ -f "${file}" ]] && upload_to_s3 "${file}"
  done
  
  cleanup_old
  
  log "Backup completed successfully"
}

main "$@"