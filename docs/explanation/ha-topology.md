# HA topology (`ha` profile)

> **Status (2026-05-30): PLANNED — not yet wired into `docker-compose.yml`.**
> The config files this doc references (`config/postgres/*`, `config/redis/*`,
> `config/rabbitmq/*`) ship today, but the `postgres-replica` / `redis-replica` /
> `redis-sentinel-1..3` / `rabbitmq-2..3` / `rabbitmq-ha-policy` **service blocks were
> never added**, so `docker compose --profile ha up` currently starts only the default
> single-node set — it is a no-op alias of the default profile. This document is the
> **design spec** for that wiring; read every "brings up / adds" below as the intended
> end state, not current behavior. Tracking: HARDENING.md P1.3.

Lumi's `docker compose --profile ha up` **is designed to** bring up a replicated
copy of every stateful dependency on a single host. The default (no profile) is
still a single-node setup; the `ha` profile is opt-in and meant either for
staging-style load tests on one box, or as a copy-pasteable starting point for a
real multi-host deploy.

## What it adds

| Service | Role |
|---|---|
| `postgres-replica` | Streaming replica of `postgres` (read-only standby) |
| `redis-replica` | Asynchronous replica of `redis` |
| `redis-sentinel-1/2/3` | Sentinels with quorum 2; watch `redis`, promote `redis-replica` on failure |
| `rabbitmq-2`, `rabbitmq-3` | Extra RabbitMQ nodes that join `rabbit@rabbitmq` into a 3-node cluster |
| `rabbitmq-ha-policy` | One-shot that applies the `queue-type=quorum` policy |

Apps still point at the canonical service names (`postgres`, `redis`,
`rabbitmq`). The HA services back those endpoints with replicas and failover
machinery.

## Postgres

Streaming replication using the stock `postgres:17` image:

- `config/postgres/primary.conf` enables `wal_level=replica`,
  `max_wal_senders=10`, `hot_standby=on`. Mounted onto the existing `postgres`
  service (harmless solo).
- `config/postgres/init-replication.sh` runs on the primary's first boot
  (`/docker-entrypoint-initdb.d/`) and creates the `replicator` role.
- `config/postgres/replica-entrypoint.sh` runs on the replica. On first boot
  (empty `$PGDATA`) it `pg_basebackup`s from the primary with `-R`, which
  writes `standby.signal` and `primary_conninfo`. On subsequent boots it just
  starts in standby mode.

### Failover

There is **no automatic failover** in this topology — that requires Patroni /
repmgr / pg_auto_failover, which are out of scope for a single-host compose
stack. The replica is promotable on demand:

```bash
# 1. Stop the primary.
docker compose stop postgres

# 2. Promote the replica.
docker compose exec postgres-replica psql -U ember -d ember -c "SELECT pg_promote();"

# 3. Repoint apps. The replica now answers writes on its own hostname; either
#    update POSTGRES_URL to point at postgres-replica or swap container names.
```

To bring the old primary back in as a new replica: wipe its data dir
(`docker volume rm lumi_postgres-data`), swap the service entrypoints, and
restart — pg_basebackup will re-seed from the new primary.

### Existing data dirs

The replication-user init script only runs when `postgres-data` is empty.
If you're enabling the `ha` profile against an existing volume, create the role
manually:

```bash
docker compose exec postgres psql -U ember -d ember -c \
  "CREATE ROLE replicator WITH REPLICATION LOGIN ENCRYPTED PASSWORD 'replicator';"
```

## Redis

Standard sentinel topology:

- One master (`redis`, the existing service).
- One replica (`redis-replica`) configured with `replicaof redis 6379`.
- Three sentinels (`redis-sentinel-1/2/3`) with `quorum 2`.

Sentinels rewrite their config file as they observe peers and run failovers, so
the sentinel container generates a writable `/data/sentinel.conf` at boot
(`config/redis/sentinel-entrypoint.sh`).

### Enabling sentinel-aware connections

Phase S5 wired ioredis to switch into sentinel mode when `REDIS_SENTINELS` is
set (see [`.env.example`](../../.env.example)). To actually use the HA cluster
from the app, set:

```env
REDIS_SENTINELS=redis-sentinel-1:26379,redis-sentinel-2:26379,redis-sentinel-3:26379
REDIS_SENTINEL_NAME=mymaster
```

With those set, the cache layer, BullMQ, the Redis Streams transport, the
cluster coordinator, and the scheduler leader lock all discover the current
master through sentinel and reconnect automatically on failover.

## RabbitMQ

A classic three-node cluster with quorum queues:

- `rabbitmq` keeps its solo config. The new nodes join it.
- `rabbitmq-2` and `rabbitmq-3` mount `config/rabbitmq/rabbitmq-ha.conf` which
  has `cluster_formation.classic_config.nodes` listing all three. On first boot
  (empty mnesia) they auto-join `rabbit@rabbitmq`; afterwards mnesia state pins
  the cluster.
- A shared `RABBITMQ_ERLANG_COOKIE` env var (default
  `ember-cluster-cookie` — change it for production) lets the nodes
  authenticate to each other.
- `rabbitmq-ha-policy` is a one-shot curl container that PUTs
  `default_queue_type=quorum` onto the `/` vhost's metadata. From RabbitMQ
  4.x this is the supported way to make all newly-declared queues quorum
  queues (Raft-replicated across the cluster) — the older `queue-type` policy
  key was removed. Pre-existing classic queues keep their type until they're
  deleted and re-declared.

Apps still connect to `rabbitmq:5672` — within the cluster, any node can serve
any queue. For real HA, run an external load balancer (HAProxy, etc.) in front
of all three so a node loss doesn't strand clients pinned to that hostname.

## Resource budget

The HA profile roughly doubles the stateful footprint of the default stack:

| Component | Default | + `ha` profile |
|---|---|---|
| Postgres | 256m | 512m (primary + replica) |
| Redis | 160m | ~340m (master + replica + 3 sentinels) |
| RabbitMQ | 256m | 768m (3 nodes) |

Plan for ~1.5 GB of additional RAM for the infra side when running both
`--profile scale --profile ha` on one host.

## What this profile does *not* solve

- **Cross-host replication.** Everything still shares the `ember-net` bridge.
  Real DR needs cross-region replicas on managed services or k8s operators.
- **Postgres auto-failover.** Manual promotion only; see above.
- **Client-side LB for RabbitMQ.** Apps connect to `rabbitmq` only — losing
  that container interrupts publishers even though `rabbitmq-2`/`-3` are alive.
  Put HAProxy in front for true client HA.

For a managed cloud deploy, treat this profile as a reference topology: the
shape (1 primary + 1 replica, sentinel for Redis, quorum queues for Rabbit) is
exactly what you want from RDS / Elasticache / CloudAMQP. The compose stack is
for local validation and self-hosters on a single beefy box.
