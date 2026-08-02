# Configuration Reference

Copy `.env.example` to `.env` and fill in the mandatory section before running anything. This page documents every variable, every Docker Compose service, and the Kubernetes manifests under `deploy/k8s/`.

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
| `POSTGRES_POOL_MAX` | Default `10`. |
| `REDIS_URL` / `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` | Redis connection. `REDIS_HOST` defaults `localhost`, `REDIS_PORT` defaults `6379`. |
| `REDIS_CACHE_DB` / `REDIS_TASK_DB` | Redis logical DB indices - `0` for caching, `1` for BullMQ task queues. |
| `RABBITMQ_URL` | RabbitMQ connection string. |
| `RABBITMQ_USER` / `RABBITMQ_PASSWORD` | Default `lumi` / `lumi`. |

### General settings

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `OWNER_IDS` | *(empty)* | Comma-separated Discord user IDs with bot-owner access. |
| `DEFAULT_PREFIX` | `,` | Prefix command trigger. |
| `NODE_ENV` | `development` | |
| `LUMI_CACHE_TTL` | `60` | |
| `LUMI_DEV_PATHS` | *(unset)* | Extra addon directories loaded in dev (e.g. a sibling `lumi-addons` checkout). |
| `MODULE_UPDATE_AUTO_RESTART` | `true` when set | Whether an addon self-update triggers an automatic restart. |

### Logging & telemetry

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `LOG_LEVEL` | `info` | |
| `LOG_FORMAT` | `pretty` | Use `json` in production for log aggregation. |
| `SERVICE_VERSION` | `0.0.0` | |
| `SERVICE_NAME` | falls back to `LUMI_ROLE` | Overrides the OTel/Prometheus service name. |
| `OTEL_ENABLED` | `false` | Enable tracing (set `true` in Compose/k8s). |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://otel-collector:4318` | |
| `OTEL_TRACES_SAMPLE_RATIO` | `1` | Lower in production (e.g. `0.1`) to cut trace volume. |
| `METRICS_ENABLED` | `true` | |
| `METRICS_PORT` | `9090` | Serves `/metrics`, `/healthz`, `/readyz`. |
| `GRAFANA_USER` / `GRAFANA_PASSWORD` | `admin` / `admin` | Only used by the bundled Grafana Compose service - change before exposing it. |

### Scalability & topology (advanced)

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `LUMI_ROLE` | `worker` | `worker` (Discord WS + all command/module logic) or `scheduler` (BullMQ only, no gateway). |
| `LUMI_CONSUMER_ID` | *(unset)* | Stable identity for this replica in Redis Streams consumer groups; in k8s this is set from the pod name. |
| `SHARD_LIST` | *(unset)* | Comma-separated shard IDs this replica owns, e.g. `0,1,2`. |
| `TOTAL_SHARDS` | `auto` | Pin the total shard count instead of following Discord's recommendation. |
| `SHARD_IDENTIFY_FORCE` | `false` | Bypass the session-start budget guard. Only for recovering a crash-loop deliberately - leaving this on defeats the guard's purpose. |
| `CLUSTER_NAME` | *(unset)* | Setting this activates Redis-backed cluster coordination, session persistence, and shared IDENTIFY throttling across replicas. Required to run `worker` at more than one replica. |
| `REDIS_SENTINELS` / `REDIS_SENTINEL_NAME` / `REDIS_SENTINEL_PASSWORD` | *(unset)* | Switch Redis connections to Sentinel-aware mode. `REDIS_SENTINEL_NAME` defaults `mymaster`. |
| `EVENT_STREAM_MAXLEN` | `100000` | Redis Stream trim length (event bus). |
| `EVENT_STREAM_MAX_DELIVERIES` | `5` | Deliveries before a message is moved to `<stream>:dlq`. |
| `EVENT_STREAM_CLAIM_MIN_IDLE_MS` | `60000` | Idle time before a pending entry is eligible for reclaim. |
| `EVENT_STREAM_ACK_WAIT_MS` | `60000` | |
| `EVENT_STREAM_CLAIM_INTERVAL_MS` | `30000` | How often the reclaim (`XAUTOCLAIM`) loop runs. |
| `EVENT_STREAM_STATS_INTERVAL_MS` | `10000` | How often stream-length/lag stats are polled and exported. |
| `SCHEDULER_LEADER_LOCK` | `false` | Require leader election among scheduler replicas (set `true` if you ever run more than one). |
| `SCHEDULER_LEADER_LOCK_TTL_MS` / `_RENEW_MS` / `_POLL_MS` | `30000` / `10000` / `2000` | |
| `COMMAND_REGISTRATION_LOCK_TTL_MS` / `_RENEW_MS` | `30000` / `10000` | Leader lock for command registration across clustered `worker` replicas. Not present in `.env.example` - add it explicitly if you're tuning it. |
| `ENTITY_CACHE_POPULATE` | `false` | |
| `DISCORD_PROXY_URL` | *(unset)* | Point at a shared Discord REST rate-limit proxy (e.g. `nirn-proxy`). Multi-replica deployments only - leave unset for single-process runs. |

### Dashboard

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `DASHBOARD_PORT` | `8080` | |
| `DASHBOARD_HOST` | `0.0.0.0` | |
| `DASHBOARD_SESSION_SECRET` | *(required for the dashboard)* | Generate with `openssl rand -hex 32`. |
| `DISCORD_OAUTH2_CLIENT_ID` / `DISCORD_OAUTH2_CLIENT_SECRET` | | From your Discord application's OAuth2 page. |
| `DISCORD_OAUTH2_REDIRECT_URI` | `http://localhost:8080/callback` | Must match the redirect URI registered on the Discord application. |
| `DASHBOARD_SECURE_COOKIES` | `false` | Set `true` once the dashboard is served over HTTPS. |

## Docker Compose

`docker-compose.yml` at the repo root defines:

| Service | Purpose |
| :--- | :--- |
| `worker` | `LUMI_ROLE=worker` - Discord WS + all bot logic. Always runs. |
| `lumi-dev` (profile `development`) | Dev container with the repo (and a sibling `../lumi-addons`) bind-mounted, pretty/debug logging, interactive TTY. |
| `worker-scale` (profile `scale`) | A second worker replica for local cluster testing. |
| `scheduler` (profile `scale`) | `LUMI_ROLE=scheduler`. |
| `dashboard` (profile `dashboard`) | Web dashboard on `${DASHBOARD_PORT:-8080}`. |
| `postgres` | `postgres:17`, primary database. |
| `pgbouncer` | Connection pooler in front of Postgres, transaction pool mode, port 6432. Point `POSTGRES_URL` at this, not directly at `postgres`. |
| `redis` | `redis:7-alpine`, AOF persistence, `maxmemory 128mb` / `noeviction`. |
| `rabbitmq` | `rabbitmq:4-management-alpine` - dashboard-to-worker RPC transport. |
| `nirn-proxy` (profile `scale`) | Shared Discord REST rate-limit proxy across replicas. |
| `otel-collector`, `tempo`, `prometheus`, `grafana` (profile `observability`) | Full tracing/metrics stack, configs under `./config/observability/`. |

All app services `depends_on` Postgres, pgbouncer, Redis, and RabbitMQ with `condition: service_healthy`. Bring up the minimal stack with:

```bash
docker compose up worker postgres pgbouncer redis rabbitmq
```

Add `--profile scale` for a second worker + scheduler, `--profile dashboard` for the web dashboard, or `--profile observability` for the full metrics/tracing stack.

## Kubernetes (`deploy/k8s/`)

| Manifest | Kind | Purpose |
| :--- | :--- | :--- |
| `namespace.yaml` | `Namespace` `lumi` | |
| `configmap.yaml` | `ConfigMap` `lumi-env` | Non-secret env: Redis/Postgres/RabbitMQ connection info, OTel/metrics settings, `CLUSTER_NAME: "lumi-prod"`, `SCHEDULER_LEADER_LOCK: "true"`. |
| `secret.example.yaml` | `Secret` template | Copy to `secret.yaml` and fill in - **never commit the filled version**. In real production, use Sealed Secrets or a vault instead of a plain `Secret` manifest. |
| `lumi-data-pvc.yaml` | `PersistentVolumeClaim` | `ReadWriteMany`, 5Gi - shared storage for downloaded addon repo files (addon *metadata* lives in Postgres; the files themselves live here). |
| `migrate-job.yaml` | `Job` | Runs `prisma migrate deploy` once, before rollout, so scaled workers don't race the same DDL. |
| `worker-statefulset.yaml` | `StatefulSet` + headless `Service` | The sharded worker fleet. `replicas: 1` by default - scaling past 1 requires `CLUSTER_NAME`. `podManagementPolicy: Parallel`, rolling updates `maxUnavailable: 1`. Readiness/liveness on `/readyz` / `/healthz`, `preStop` sleeps 15s before termination for a graceful drain. |
| `scheduler-deployment.yaml` | `Deployment` | `replicas: 1`, `strategy: Recreate` - guarantees exactly one BullMQ owner at a time. |
| `nirn-proxy-deployment.yaml` | `Deployment` + `Service` | `replicas: 2`, stateless Discord REST proxy shared by worker replicas. |

Deploy order: namespace → secrets/configmap → PVC → `migrate-job` (wait for completion) → `nirn-proxy` → `scheduler` → `worker`.

Worker replica count is a manual shard-assignment decision, not autoscaled: pick a shards-per-replica target (16-32 is a reasonable starting point) and divide your total shard count by it, then `kubectl scale statefulset/worker --replicas=<n>`.

See `deploy/k8s/README.md` for the full walkthrough.
