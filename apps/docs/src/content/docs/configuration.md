---
title: "Configuration Reference"
description: "Complete reference for every environment variable, database pool tuning, cluster topology, Docker Compose service, and Kubernetes manifest."
---

Copy `.env.example` to `.env` and fill in the mandatory section before running anything. This page documents every variable, every Docker Compose service, and the Kubernetes manifests under `deploy/k8s/`.

### One file, all services

The repo-root `.env` is the single source of truth. `apps/worker/.env` and `apps/dashboard/.env` are symlinks to it — each app is started with its own directory as cwd and Bun auto-loads whatever `.env` it finds there, so the links are what stop separately-maintained copies from drifting apart. `scripts/setup.sh` creates them; `.env` is gitignored at every level, so they can't be committed and a fresh checkout needs that run (or `ln -s ../../.env apps/<app>/.env` by hand).

The consequence is that a value in the root `.env` applies to *every* service. Anything that must differ per service is therefore left unset there and defaulted in code, or has a per-service key, as with `<SERVICE>_METRICS_PORT`.

## Environment variables

### Mandatory

No default - the app will not boot without these.

| Variable | Purpose |
| :--- | :--- |
| `BOT_TOKEN` | Discord bot token. |
| `CLIENT_ID` | Discord application (client) ID. |
| `POSTGRES_URL` | Pooled Postgres connection string (point this at `pgbouncer` in multi-replica setups). |
| `DIRECT_POSTGRES_URL` | Unpooled Postgres connection string, used for migrations. |
| `POSTGRES_PASSWORD` | Default `lumi`. |
| `POSTGRES_POOL_MAX` / `POSTGRES_POOL_TOTAL` | Connection pool budgeting (`POSTGRES_POOL_TOTAL` default `80` divided across shards, or fixed `POSTGRES_POOL_MAX` default `10` per process). |
| `REDIS_URL` / `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` | Redis connection. `REDIS_HOST` defaults `localhost`, `REDIS_PORT` defaults `6379`. |
| `REDIS_CACHE_DB` / `REDIS_TASK_DB` | Redis logical DB indices - `0` for caching, `1` for BullMQ task queues. |
| `RPC_HTTP_HOST` / `RPC_HTTP_PORT` | Bind address for the internal RPC HTTP server. Defaults `127.0.0.1` / `8091`. Only the primary shard in a pod binds it (see [Architecture](/Lumi/architecture/)), so there's nothing else on a single host to collide with. Set `0.0.0.0` only where the dashboard runs in another container. Never published to the host. |
| `RPC_INTERNAL_TOKEN` | Shared secret the dashboard sends as `Authorization: Bearer` on every internal RPC call. Required when `NODE_ENV=production` - the worker refuses to start the RPC server without it. Generate with `openssl rand -hex 32`. |

### General settings

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `OWNER_IDS` | *(empty)* | Comma-separated Discord user IDs with bot-owner access. |
| `DEFAULT_PREFIX` | `,` | Prefix command trigger. |
| `NODE_ENV` | `development` | Runtime environment mode (`development`, `production`, `test`). |
| `LUMI_CACHE_TTL` | `60` | Default cache TTL in seconds for entity caches. |
| `LUMI_DEV_PATHS` | *(unset)* | Extra addon directories loaded in dev (e.g. a sibling `lumi-addons` checkout). |
| `MODULE_UPDATE_AUTO_RESTART` | `true` when set | Whether an addon self-update triggers an automatic restart. |

### Logging & telemetry

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `LOG_LEVEL` | `info` | `trace`, `debug`, `info`, `warn`, `error`, `fatal`. |
| `LOG_FORMAT` | `pretty` | Use `json` in production for log aggregation. |
| `SERVICE_VERSION` | `0.0.0` | Semantic version injected into telemetry. |
| `SERVICE_NAME` | `lumi` | Overrides the OTel/Prometheus service name. |
| `OTEL_ENABLED` | `false` | Enable OpenTelemetry tracing (set `true` in Compose/k8s). |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://otel-collector:4318` | HTTP endpoint for OTLP trace export. |
| `OTEL_TRACES_SAMPLE_RATIO` | `1` | Lower in production (e.g. `0.1`) to cut trace volume. |
| `METRICS_ENABLED` | `true` | Enable Prometheus metrics HTTP endpoint. |
| `METRICS_PORT` | `9090` | Serves `/metrics`, `/healthz`, `/readyz`. |
| `METRICS_HOST` | `127.0.0.1` | Set `0.0.0.0` where Prometheus scrapes across containers. |
| `<SERVICE>_METRICS_PORT` | — | Per-service override, e.g. `DASHBOARD_METRICS_PORT`. |
| `GRAFANA_USER` / `GRAFANA_PASSWORD` | — | Only used by the bundled Grafana Compose service. Required when running observability profile. |

### Enterprise mega-fleet scaling & topology (advanced)

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `LUMI_CONSUMER_ID` | *(unset)* | Stable identity for this replica in Redis Streams consumer groups; in k8s this is set from the pod name. |
| `SHARD_LIST` | `auto` | Comma-separated shard IDs this replica's `ShardingManager` spawns children for, e.g. `0,1,2`. |
| `TOTAL_SHARDS` | `auto` | Pin the total shard count instead of following Discord's recommendation. |
| `CLUSTER_ID` / `TOTAL_CLUSTERS` / `SHARDS_PER_CLUSTER` | *(unset)* | Multi-cluster mega-fleet orchestration coordinates static cluster sharding. |
| `CLUSTER_NAME` | *(unset)* | Namespaces the shard telemetry each shard publishes to Redis for the dashboard's fleet view. |
| `POSTGRES_POOL_SIZE` | `10` | Base pool size for database connections per shard. |
| `POSTGRES_MAX_OVERFLOW` | `5` | Max connection overflow allowed under transient spikes. |
| `POSTGRES_POOL_TIMEOUT_SECONDS` | `10` | Pool acquisition timeout in seconds before throwing. |
| `POSTGRES_IDLE_TIMEOUT_SECONDS` | `300` | Eviction threshold for idle connections in the pool. |
| `POSTGRES_REPLICA_URL` | *(unset)* | Optional PostgreSQL read replica for cross-guild queries & sweeps. |
| `REDIS_CLUSTER_MODE` | `false` | Enable native multi-node Redis Cluster mode. |
| `REDIS_CLUSTER_NODES` | *(unset)* | Comma-separated `host:port` pairs enabling multi-master Redis Cluster mode. |
| `REDIS_CLUSTER_SCALE_READS` | `master` | Read-scaling target for Redis Cluster (`master`, `slave`, `all`). |
| `REDIS_MAX_RETRIES` | `5` | Maximum retry attempts for Redis command execution. |
| `REDIS_COMMAND_TIMEOUT_MS` | `3000` | Command execution timeout in milliseconds. |
| `REDIS_SENTINELS` / `REDIS_SENTINEL_NAME` / `REDIS_SENTINEL_PASSWORD` | *(unset)* | Switch Redis connections to Sentinel-aware mode. `REDIS_SENTINEL_NAME` defaults `mymaster`. |
| `DISCORD_REST_GLOBAL_RATE_LIMIT` | `50` | Global requests per second limit for Discord REST API client. |
| `DISCORD_REST_SWEEP_INTERVAL_SECONDS` | `60` | Interval in seconds for sweeping expired rate-limit buckets. |
| `SHARD_RESPAWN_DELAY_MS` | `5000` | Delay between consecutive shard spawn operations during rollout. |
| `SHARD_MAX_CONCURRENT_SPAWNS` | `2` | Number of shards permitted to initialize concurrently. |
| `CACHE_MESSAGE_LIMIT` / `CACHE_MEMBER_LIMIT` / `CACHE_USER_LIMIT` / `CACHE_THREAD_LIMIT` | `50` / `50` / `200` / `25` | Per-shard in-memory Discord.js manager cache capacities. |
| `SWEEPER_MESSAGES_INTERVAL` / `SWEEPER_MESSAGES_LIFETIME` | `300` / `600` | Gateway message cache sweep interval and message retention in seconds. |
| `SWEEPER_MEMBERS_INTERVAL` / `SWEEPER_MEMBERS_LIFETIME` | `1800` / `1800` | Gateway guild member sweep interval and retention in seconds. |
| `EVENT_STREAM_MAXLEN` | `100000` | Redis Stream trim length (event bus). |
| `EVENT_STREAM_MAX_DELIVERIES` | `5` | Deliveries before a message is moved to `<stream>:dlq`. |
| `EVENT_STREAM_CLAIM_MIN_IDLE_MS` | `60000` | Idle time before a pending entry is eligible for reclaim. |
| `EVENT_STREAM_ACK_WAIT_MS` | `60000` | Timeout before unacknowledged messages are reclaimed. |
| `EVENT_STREAM_CLAIM_INTERVAL_MS` | `30000` | How often the reclaim (`XAUTOCLAIM`) loop runs. |
| `EVENT_STREAM_STATS_INTERVAL_MS` | `10000` | How often stream-length/lag stats are polled and exported. |
| `ENTITY_CACHE_POPULATE` | `false` | Preload entity cache on shard startup. |
| `DISCORD_PROXY_URL` / `DISCORD_REST_PROXY_URL` / `REST_PROXY_URL` | *(unset)* | Point at a shared Discord REST rate-limit proxy (e.g. `nirn-proxy`). Multi-replica deployments only. |
| `DISCORD_REST_TIMEOUT_MS` / `DISCORD_REST_RETRIES` | `15000` / `3` | Discord REST request timeout and retry attempts. |

### Dashboard

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `DASHBOARD_PORT` | `8080` | Listen port for Next.js web application. |
| `DASHBOARD_HOST` | `0.0.0.0` | Bind host interface. |
| `DASHBOARD_SESSION_SECRET` | *(required for dashboard)* | Generate with `openssl rand -hex 32`. |
| `DISCORD_OAUTH2_CLIENT_ID` / `DISCORD_OAUTH2_CLIENT_SECRET` | | From your Discord application's OAuth2 page. |
| `AUTH_URL` | *(derived from request)* | The dashboard's externally visible origin (required if behind reverse proxy). |
| `METRICS_ENABLED` / `METRICS_PORT` | `true` / `9090` | The dashboard's `/healthz`, `/readyz`, `/metrics` server. |
| `CLIENT_IP_HEADER` | *(unset)* | Name of the client-IP header set by your reverse proxy (`cf-connecting-ip`, `x-real-ip`). |
| `TRUSTED_PROXY_HOPS` | `1` | Number of trusted proxies in front of the dashboard. |

There is **no** OAuth2 redirect-URI variable. NextAuth derives the callback from the incoming request; the path is `/api/auth/callback/discord`. Register `https://<your-dashboard-origin>/api/auth/callback/discord` under **OAuth2 → Redirects** on your Discord application.

Full reference for the app itself: [Dashboard Reference](/Lumi/dashboard/).

## Docker Compose

`docker-compose.yml` at the repo root defines:

| Service | Purpose |
| :--- | :--- |
| `worker` | Discord WS + all bot logic, spawned per-shard via `ShardingManager`. Always runs. |
| `lumi-dev` (profile `development`) | Dev container with the repo bind-mounted, pretty/debug logging, interactive TTY. |
| `worker-scale` (profile `scale`) | A second worker replica for local cluster testing. |
| `dashboard` (profile `dashboard`) | Web dashboard on `${DASHBOARD_PORT:-8080}`, built via `Dockerfile.dashboard`. |
| `postgres` | `postgres:18-alpine`, primary database. |
| `pgbouncer` | Connection pooler in front of Postgres, transaction pool mode, port 6432. |
| `redis` | `redis:7-alpine`, AOF persistence, `maxmemory 128mb` / `noeviction`. |
| `nirn-proxy` (profile `scale`) | Shared Discord REST rate-limit proxy across replicas. |
| `otel-collector`, `tempo`, `prometheus`, `grafana` (profile `observability`) | Full tracing/metrics stack, configs under `./config/observability/`. |

Bring up the minimal stack with:

```bash
docker compose up worker postgres pgbouncer redis
```

Add `--profile dashboard` to run the web UI, `--profile scale` for multi-worker testing, or `--profile observability` for metrics and tracing.

## Kubernetes (`deploy/k8s/`)

| Manifest | Kind | Purpose |
| :--- | :--- | :--- |
| `namespace.yaml` | `Namespace` `lumi` | Isolated Kubernetes namespace for all Lumi components. |
| `configmap.yaml` | `ConfigMap` `lumi-env` | Non-secret env: connection info, RPC host/port, OTel/metrics settings, `CLUSTER_NAME: "lumi-prod"`. |
| `secret.example.yaml` | `Secret` template | Copy to `secret.yaml` and fill in — **never commit the filled version**. |
| `lumi-data-pvc.yaml` | `PersistentVolumeClaim` | `ReadWriteMany`, 5Gi — shared storage for downloaded addon repo files. |
| `migrate-job.yaml` | `Job` | Runs `prisma migrate deploy` once, before rollout, so workers don't race the same DDL. |
| `worker-statefulset.yaml` | `StatefulSet` + headless `Service` | The sharded worker fleet. Shard 0 assumes primary role for BullMQ and RPC. |
| `dashboard-deployment.yaml` | `Deployment` + `Service` | Next.js admin dashboard web application (reaches worker RPC on `worker-0`). |
| `nirn-proxy-deployment.yaml` | `Deployment` + `Service` | `replicas: 2`, stateless Discord REST proxy shared by worker replicas. |

Deploy order: namespace → secrets/configmap → PVC → `migrate-job` (wait for completion) → `nirn-proxy` → `worker` → `dashboard`.

See `deploy/k8s/README.md` for the full walkthrough.
