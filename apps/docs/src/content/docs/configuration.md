---
title: "Configuration Reference"
description: "Complete reference for every environment variable, database pool tuning, cluster topology, Docker Compose service, and Kubernetes manifest."
category: "Getting Started"
---

# Configuration Reference

Copy `.env.example` to `.env` and fill in the mandatory section before running anything. This page documents every environment variable, every Docker Compose service, and the Kubernetes manifests under `deploy/k8s/`.

### One file, all services

The repository root `.env` is the single source of truth. `apps/worker/.env` and `apps/dashboard/.env` are symlinks pointing to it (`../../.env`). Each app runs with its own directory as current working directory and Bun auto-loads the `.env` it finds there. The symlinks keep separately maintained copies from drifting apart. Running `bun run setup` (or `bash scripts/setup.sh`) creates these symlinks automatically.

Because `.env` is gitignored at every level, a fresh clone needs `bun run setup` (or manual symlinking via `ln -s ../../.env apps/worker/.env && ln -s ../../.env apps/dashboard/.env`).

A variable set in the root `.env` applies to every workspace app and service. Anything that must differ per service can be left unset and defaulted in code, or configured via a service-specific override such as `<SERVICE>_METRICS_PORT` (e.g. `DASHBOARD_METRICS_PORT`).

---

## Environment Variables

### Mandatory

Lumi will fail to start if any of these variables are missing:

| Variable | Purpose | Example / Default |
| :--- | :--- | :--- |
| `BOT_TOKEN` | Discord bot token from the Discord Developer Portal (Bot tab). | `MTA...` |
| `CLIENT_ID` | Discord application (client) ID. | `123456789012345678` |
| `POSTGRES_URL` | Pooled PostgreSQL connection string (connects via PgBouncer in multi-replica deployments). | `postgresql://lumi:lumi@localhost:5432/lumi` (or port `6432` for PgBouncer) |
| `DIRECT_POSTGRES_URL` | Direct unpooled PostgreSQL connection string, used exclusively for migrations. | `postgresql://lumi:lumi@localhost:5432/lumi` |
| `POSTGRES_PASSWORD` | PostgreSQL database password. | `lumi` |
| `POSTGRES_POOL_MAX` / `POSTGRES_POOL_TOTAL` | Database connection pool budget. If `POSTGRES_POOL_MAX` is set, each process gets that fixed pool size (default `10`). Otherwise, `POSTGRES_POOL_TOTAL` (default `80`) is dynamically divided by the number of shards on the instance (minimum 2). | `10` / `80` |
| `REDIS_URL` / `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` | Redis connection parameters. | `redis://localhost:6379`, `localhost`, `6379` |
| `REDIS_CACHE_DB` / `REDIS_TASK_DB` | Logical Redis DB indices: `0` for cache-aside and telemetry, `1` for BullMQ task queues. | `0` and `1` |
| `RPC_HTTP_HOST` / `RPC_HTTP_PORT` | Bind host and port for the worker's internal HTTP RPC bridge. Defaults to `127.0.0.1` and `8091`. Only the primary shard (holding Shard ID 0) binds this port. | `127.0.0.1` / `8091` |
| `RPC_INTERNAL_TOKEN` | Shared secret token sent as `Authorization: Bearer <token>` on every dashboard-to-worker RPC call. Required when `NODE_ENV=production`. Generate with `openssl rand -hex 32`. | 32-byte hex string |

---

### General Settings

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `OWNER_IDS` | *(empty)* | Comma-separated Discord user IDs with bot-owner access. |
| `DEFAULT_PREFIX` | `,` | Prefix command trigger for legacy message commands. |
| `NODE_ENV` | `development` | Runtime environment mode (`development`, `production`, `test`). |
| `LUMI_CACHE_TTL` | `60` | Default cache TTL in seconds for entity and permission caches in Redis. |
| `LUMI_DEV_PATHS` | *(unset)* | Comma- or colon-separated list of local directory paths to scan for addons during development (e.g. `./addons`). |
| `MODULE_UPDATE_AUTO_RESTART` | `true` | Whether an addon self-update triggers an automatic worker restart. |

---

### Logging & Telemetry

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `LOG_LEVEL` | `info` | Logging verbosity: `trace`, `debug`, `info`, `warn`, `error`, `fatal`. |
| `LOG_FORMAT` | `pretty` | Log output format: `pretty` for local development, `json` for structured log aggregation. |
| `SERVICE_VERSION` | `0.0.0` | Semantic version string injected into telemetry spans and metrics. |
| `SERVICE_NAME` | `lumi` | OpenTelemetry and Prometheus service identifier. |
| `OTEL_ENABLED` | `false` | Enable OpenTelemetry tracing (set `true` in production/Kubernetes). |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://otel-collector:4318` | HTTP endpoint for OTLP trace export. |
| `OTEL_TRACES_SAMPLE_RATIO` | `1` | Trace sampling ratio: `1` (100%) in development, lower (e.g. `0.1`) in high-traffic production. |
| `METRICS_ENABLED` | `true` | Enable the Prometheus HTTP metrics and health check endpoint. |
| `METRICS_PORT` | `9090` | Port serving `/metrics`, `/healthz`, and `/readyz`. Bound by the primary shard. |
| `METRICS_HOST` | `127.0.0.1` | Bind interface for metrics. Set to `0.0.0.0` when scraped across containers or Kubernetes pods. |
| `<SERVICE>_METRICS_PORT` | — | Per-service override (e.g. `DASHBOARD_METRICS_PORT`). |
| `GRAFANA_USER` / `GRAFANA_PASSWORD` | `admin` / `admin` | Credentials for the bundled Grafana instance in Docker Compose. |

---

### Fleet Scaling & Cluster Topology

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `LUMI_CONSUMER_ID` | `worker-<pid>` | Unique identifier for this worker replica in Redis Streams consumer groups (`HOSTNAME` in Kubernetes). |
| `SHARD_LIST` | `auto` | Comma-separated list of shard IDs this replica spawns child processes for (e.g. `0,1,2,3`). |
| `TOTAL_SHARDS` | `auto` | Total shard count across all replicas. `auto` follows Discord's recommendation. |
| `CLUSTER_NAME` | *(unset)* | Namespaces shard telemetry published to Redis (`lumi:shards:<cluster>`). Unset defaults to `"default"`. |
| `POSTGRES_REPLICA_URL` | *(unset)* | Optional read-replica connection string for cross-guild background sweeps (`prismaReader`). |
| `EVENT_STREAM_MAXLEN` | `100000` | Approximate maximum length for Redis Streams event queues (`XADD ... MAXLEN ~ 100000`). |
| `EVENT_STREAM_MAX_DELIVERIES` | `5` | Maximum delivery attempts before moving a poison message to `<stream>:dlq`. |
| `EVENT_STREAM_CLAIM_MIN_IDLE_MS` | `60000` | Minimum idle time before an unacknowledged message is reclaimed via `XAUTOCLAIM`. |
| `EVENT_STREAM_ACK_WAIT_MS` | `60000` | Timeout threshold before unacknowledged messages trigger recovery. |
| `EVENT_STREAM_CLAIM_INTERVAL_MS` | `30000` | Frequency of the background message reclamation loop. |
| `EVENT_STREAM_STATS_INTERVAL_MS` | `10000` | Interval for polling stream length and consumer lag metrics. |
| `ENTITY_CACHE_POPULATE` | `false` | Preload Discord entity caches on shard boot. |
| `DISCORD_PROXY_URL` / `REST_PROXY_URL` | *(unset)* | Shared outbound REST proxy (such as `nirn-proxy`) for rate-limit coordination across worker replicas. |
| `DASHBOARD_PUBLIC_URL` | *(unset)* | Public base URL of the dashboard (e.g. `https://lumi.example.com`) used when generating ban appeal links. |

---

### Dashboard Settings

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `DASHBOARD_PORT` | `8080` | Port for the Next.js web application (default `8080` in production, `3000` in `next dev`). |
| `DASHBOARD_HOST` | `0.0.0.0` | Bind host interface. |
| `DASHBOARD_SESSION_SECRET` / `AUTH_SECRET` | *(required)* | 32-byte secret for NextAuth JWT session encryption (`openssl rand -hex 32`). |
| `DISCORD_OAUTH2_CLIENT_ID` | *(required)* | Discord application OAuth2 client ID. |
| `DISCORD_OAUTH2_CLIENT_SECRET` | *(required)* | Discord application OAuth2 client secret. |
| `AUTH_URL` | *(derived)* | Externally visible URL origin if the dashboard sits behind a TLS-terminating reverse proxy. |
| `CLIENT_IP_HEADER` | *(unset)* | Reverse proxy client IP header (`cf-connecting-ip`, `x-real-ip`). |
| `TRUSTED_PROXY_HOPS` | `1` | Number of upstream reverse proxy hops trusted for IP rate limiting. |

> [!NOTE]
> NextAuth automatically derives the OAuth2 callback URI from the incoming request. The callback path is `/api/auth/callback/discord`. Register `https://<your-dashboard-domain>/api/auth/callback/discord` under **OAuth2 → Redirects** in the Discord Developer Portal.

Full reference for the app itself: [Dashboard Reference](/dashboard).

---

## Docker Compose Services

The root `docker-compose.yml` defines the following services:

| Service | Profile | Purpose |
| :--- | :--- | :--- |
| `worker` | *(default)* | The Discord bot worker process (`apps/worker`). Spawns shard child processes via `ShardingManager`. |
| `postgres` | *(default)* | PostgreSQL 18 database (`postgres:18-alpine`). Port `5432`. |
| `pgbouncer` | *(default)* | PgBouncer connection pooler in transaction mode. Port `6432`. |
| `redis` | *(default)* | Redis 7 in-memory cache and Redis Streams message bus. Port `6379`. |
| `dashboard` | `dashboard` | Next.js web administration dashboard (`apps/dashboard`). Port `8080`. |
| `lumi-dev` | `development` | Interactive development container with repository bind-mounted. |
| `worker-scale` | `scale` | Secondary worker replica for multi-shard cluster testing. |
| `nirn-proxy` | `scale` | Shared Discord REST rate-limit proxy. |
| `otel-collector`, `tempo`, `prometheus`, `grafana` | `observability` | Full OpenTelemetry tracing, Prometheus scraping (`9090`), and Grafana dashboard (`3000`). |

To start the baseline stack:

```bash
docker compose up -d worker postgres pgbouncer redis
```

To include the web dashboard and observability stack:

```bash
docker compose --profile dashboard --profile observability up -d
```

---

## Kubernetes Deployments (`deploy/k8s/`)

| Manifest | Kind | Purpose |
| :--- | :--- | :--- |
| `namespace.yaml` | `Namespace` | Isolated `lumi` Kubernetes namespace. |
| `configmap.yaml` | `ConfigMap` | Non-sensitive configuration (hosts, ports, metrics flags, cluster names). |
| `secret.example.yaml` | `Secret` template | Template for sensitive secrets (`BOT_TOKEN`, `RPC_INTERNAL_TOKEN`, database passwords). |
| `lumi-data-pvc.yaml` | `PersistentVolumeClaim` | `ReadWriteMany` persistent storage for downloaded addon repositories. |
| `migrate-job.yaml` | `Job` | Runs `prisma migrate deploy` prior to rollout to prevent migration concurrency races. |
| `worker-statefulset.yaml` | `StatefulSet` + headless `Service` | Sharded worker fleet. Shard 0 assumes primary role for BullMQ scheduling and RPC. |
| `dashboard-deployment.yaml` | `Deployment` + `Service` | Next.js admin dashboard communicating with `worker-0` over internal HTTP RPC (`8091`). |
| `nirn-proxy-deployment.yaml` | `Deployment` + `Service` | Stateless Discord REST proxy shared across worker replicas. |

Deployment order:
1. `namespace.yaml`
2. `configmap.yaml` and filled `secret.yaml`
3. `lumi-data-pvc.yaml`
4. `migrate-job.yaml` (wait for completion)
5. `nirn-proxy-deployment.yaml`
6. `worker-statefulset.yaml`
7. `dashboard-deployment.yaml`

See `deploy/k8s/README.md` for the full walkthrough.

