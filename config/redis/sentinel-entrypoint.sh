#!/bin/sh
# Generates a writable sentinel.conf at boot - sentinel rewrites this file when
# state changes (known replicas, failover epoch), so we can't mount it read-only.
set -eu

MASTER_NAME="${SENTINEL_MASTER_NAME:-mymaster}"
MASTER_HOST="${SENTINEL_MASTER_HOST:-redis}"
MASTER_PORT="${SENTINEL_MASTER_PORT:-6379}"
QUORUM="${SENTINEL_QUORUM:-2}"
DOWN_AFTER_MS="${SENTINEL_DOWN_AFTER_MS:-5000}"
FAILOVER_TIMEOUT_MS="${SENTINEL_FAILOVER_TIMEOUT_MS:-30000}"
PARALLEL_SYNCS="${SENTINEL_PARALLEL_SYNCS:-1}"
AUTH_PASS="${REDIS_PASSWORD:-lumi}"

cat >/data/sentinel.conf <<EOF
port 26379
dir /data
sentinel resolve-hostnames yes
sentinel announce-hostnames yes
sentinel monitor ${MASTER_NAME} ${MASTER_HOST} ${MASTER_PORT} ${QUORUM}
sentinel down-after-milliseconds ${MASTER_NAME} ${DOWN_AFTER_MS}
sentinel failover-timeout ${MASTER_NAME} ${FAILOVER_TIMEOUT_MS}
sentinel parallel-syncs ${MASTER_NAME} ${PARALLEL_SYNCS}
sentinel auth-pass ${MASTER_NAME} ${AUTH_PASS}
EOF

exec redis-sentinel /data/sentinel.conf
