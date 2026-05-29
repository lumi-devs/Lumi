#!/bin/bash
# Replica entrypoint: on first boot the data dir is empty, so we pg_basebackup
# from the primary with -R (writes standby.signal + primary_conninfo into
# postgresql.auto.conf). On subsequent boots the data dir is already a standby
# and we just hand control to the stock postgres entrypoint.
set -euo pipefail

PRIMARY_HOST="${POSTGRES_PRIMARY_HOST:-postgres-primary}"
PRIMARY_PORT="${POSTGRES_PRIMARY_PORT:-5432}"
REPL_USER="${POSTGRES_REPLICATION_USER:-replicator}"
REPL_PASSWORD="${POSTGRES_REPLICATION_PASSWORD:-replicator}"

if [ ! -s "$PGDATA/PG_VERSION" ]; then
  echo "[replica] empty data dir; running pg_basebackup against ${PRIMARY_HOST}:${PRIMARY_PORT}"
  until PGPASSWORD="$REPL_PASSWORD" pg_basebackup \
      -h "$PRIMARY_HOST" -p "$PRIMARY_PORT" \
      -U "$REPL_USER" \
      -D "$PGDATA" \
      -Fp -Xs -P -R; do
    echo "[replica] primary not ready, retrying in 5s..."
    sleep 5
  done
  chmod 0700 "$PGDATA"
fi

# Standby must run with `max_connections >= primary` and the same set of
# replication-relevant GUCs, otherwise recovery aborts. Sourcing the same
# primary.conf keeps the two sides aligned and lets the replica be promoted
# cleanly later (`pg_promote()` just drops standby.signal).
exec docker-entrypoint.sh postgres \
  -c config_file=/etc/postgresql/postgresql.conf \
  -c hba_file=/etc/postgresql/pg_hba.conf
