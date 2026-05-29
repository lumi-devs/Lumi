#!/bin/sh
# Sets `default_queue_type=quorum` as vhost metadata on `/`. From RabbitMQ 4.x
# this is the supported way to make all *newly-declared* queues quorum queues
# (Raft-replicated across the cluster) — the older `queue-type` policy key was
# removed. Queues already declared as classic keep their type until deleted
# and re-declared.
#
# Uses the management API rather than rabbitmqctl so this can run from a tiny
# curl image instead of needing a full rabbitmq image.
set -eu

HOST="${RABBITMQ_HOST:-rabbitmq}"
USER="${RABBITMQ_USER:-ember}"
PASS="${RABBITMQ_PASSWORD:-ember}"

echo "[ha-policy] waiting for ${HOST} management API..."
until curl -sf -u "${USER}:${PASS}" "http://${HOST}:15672/api/overview" >/dev/null; do
  sleep 2
done

echo "[ha-policy] setting default_queue_type=quorum on vhost /..."
# `PUT /api/vhosts/<name>` is upsert + accepts metadata fields.
curl -sf -u "${USER}:${PASS}" \
  -H 'content-type: application/json' \
  -X PUT "http://${HOST}:15672/api/vhosts/%2F" \
  -d '{"default_queue_type":"quorum"}'

echo "[ha-policy] done."
