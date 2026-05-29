#!/bin/bash
# Runs on the primary's first boot (mounted into /docker-entrypoint-initdb.d).
# Creates the replication role the standby uses for pg_basebackup + streaming.
set -euo pipefail

REPL_USER="${POSTGRES_REPLICATION_USER:-replicator}"
REPL_PASSWORD="${POSTGRES_REPLICATION_PASSWORD:-replicator}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  CREATE ROLE ${REPL_USER} WITH REPLICATION LOGIN ENCRYPTED PASSWORD '${REPL_PASSWORD}';
EOSQL
