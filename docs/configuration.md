# Configuration Reference

Copy `.env.example` to `.env` and fill in the mandatory section before running anything. This page documents every variable, every Docker Compose service, and the Kubernetes manifests under `deploy/k8s/`.

### One file, all services

The repo-root `.env` is the single source of truth. `apps/worker/.env`, `apps/scheduler/.env` and `apps/dashboard/.env` are symlinks to it — each app is started with its own directory as cwd and Bun auto-loads whatever `.env` it finds there, so the links are what stop three separately-maintained copies from drifting apart. `scripts/setup.sh` creates them; `.env` is gitignored at every level, so they can't be committed and a fresh checkout needs that run (or `ln -s ../../.env apps/<app>/.env` by hand).

The consequence is that a value in the root `.env` applies to *every* service. Anything that must differ per service is therefore left unset there and defaulted in code — `LUMI_ROLE` (each entrypoint declares its own role) and `RPC_HTTP_PORT` (worker `8091`, scheduler `8092`) — or has a per-service key, as with `<SERVICE>_METRICS_PORT`.

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
| `RPC_HTTP_HOST` / `RPC_HTTP_PORT` | Bind address for the internal RPC HTTP server. Defaults `127.0.0.1` / `8091` on the worker; the scheduler runs one too and self-defaults to `8092` so the pair don't collide on a single host. Set `0.0.0.0` only where the dashboard runs in another container. Never published to the host. Leave `RPC_HTTP_PORT` unset in a shared `.env` — a value there forces both services onto the same port. |
| `RPC_INTERNAL_TOKEN` | Shared secret the dashboard sends as `Authorization: Bearer` on every internal RPC call. Required when `NODE_ENV=production` - the worker refuses to start the RPC server without it. Generate with `openssl rand -hex 32`. |

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
| `METRICS_HOST` | `127.0.0.1` | Set `0.0.0.0` only where Prometheus scrapes across containers (docker-compose sets it on `worker`, `worker-scale`, `scheduler`). |
| `<SERVICE>_METRICS_PORT` | — | Per-service override, e.g. `DASHBOARD_METRICS_PORT`. Needed when several services share one host and one `.env`; without it they contend for `METRICS_PORT` and only the first binds. |
| `GRAFANA_USER` / `GRAFANA_PASSWORD` | — | Only used by the bundled Grafana Compose service. Required - compose refuses to start without `GRAFANA_PASSWORD` set. |

### Scalability & topology (advanced)

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `LUMI_ROLE` | `worker` | `worker` (Discord WS + all command/module logic) or `scheduler` (BullMQ only, no gateway). Set by each entrypoint for itself and only used to label logs/metrics — leave it unset in a shared `.env`, where a fixed value mislabels the scheduler. Compose and the k8s manifests set it per service, which is correct: there one process reads one env. |
| `LUMI_CONSUMER_ID` | *(unset)* | Stable identity for this replica in Redis Streams consumer groups; in k8s this is set from the pod name. |
| `SHARD_LIST` | *(unset)* | Comma-separated shard IDs this replica owns, e.g. `0,1,2`. |
| `TOTAL_SHARDS` | `auto` | Pin the total shard count instead of following Discord's recommendation. |
| `SHARD_IDENTIFY_FORCE` | `false` | Bypass the session-start budget guard. Only for recovering a crash-loop deliberately - leaving this on defeats the guard's purpose. |
| `CLUSTER_NAME` | *(unset)* | Namespaces the shard telemetry each replica publishes to Redis for the dashboard's fleet view. Shard ownership itself is static, set per replica via `SHARD_LIST` - set `CLUSTER_NAME` to the same value on every replica sharing a fleet so the dashboard can tell them apart. |
| `REDIS_SENTINELS` / `REDIS_SENTINEL_NAME` / `REDIS_SENTINEL_PASSWORD` | *(unset)* | Switch Redis connections to Sentinel-aware mode. `REDIS_SENTINEL_NAME` defaults `mymaster`. |
| `EVENT_STREAM_MAXLEN` | `100000` | Redis Stream trim length (event bus). |
| `EVENT_STREAM_MAX_DELIVERIES` | `5` | Deliveries before a message is moved to `<stream>:dlq`. |
| `EVENT_STREAM_CLAIM_MIN_IDLE_MS` | `60000` | Idle time before a pending entry is eligible for reclaim. |
| `EVENT_STREAM_ACK_WAIT_MS` | `60000` | |
| `EVENT_STREAM_CLAIM_INTERVAL_MS` | `30000` | How often the reclaim (`XAUTOCLAIM`) loop runs. |
| `EVENT_STREAM_STATS_INTERVAL_MS` | `10000` | How often stream-length/lag stats are polled and exported. |
| `SCHEDULER_LEADER_LOCK` | `false` | Require leader election among scheduler replicas (set `true` if you ever run more than one). |
| `SCHEDULER_LEADER_LOCK_TTL_MS` / `_RENEW_MS` / `_POLL_MS` | `30000` / `10000` / `2000` | |
| `ENTITY_CACHE_POPULATE` | `false` | |
| `DISCORD_PROXY_URL` | *(unset)* | Point at a shared Discord REST rate-limit proxy (e.g. `nirn-proxy`). Multi-replica deployments only - leave unset for single-process runs. |

### Dashboard

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `DASHBOARD_PORT` | `8080` | |
| `DASHBOARD_HOST` | `0.0.0.0` | |
| `DASHBOARD_SESSION_SECRET` | *(required for the dashboard)* | Generate with `openssl rand -hex 32`. |
| `DISCORD_OAUTH2_CLIENT_ID` / `DISCORD_OAUTH2_CLIENT_SECRET` | | From your Discord application's OAuth2 page. |
| `AUTH_URL` | *(derived from the request)* | The dashboard's externally visible origin. Only needed if a reverse proxy rewrites the Host header. |
| `METRICS_ENABLED` / `METRICS_PORT` | `true` / `9090` | The dashboard's `/healthz`, `/readyz`, `/metrics` server, same as the other roles. |
| `CLIENT_IP_HEADER` | *(unset)* | Name of the client-IP header your reverse proxy sets **and strips from inbound requests** (`cf-connecting-ip`, `x-real-ip`, …). Used verbatim when set, and the only fully spoof-proof option. Keys the login and `/api/auth/*` rate limits. |
| `TRUSTED_PROXY_HOPS` | `1` | How many trusted proxies sit in front of the dashboard, used to pick the right `X-Forwarded-For` entry when `CLIENT_IP_HEADER` is unset. Too high and a client can forge its own limiter bucket. |

There is **no** OAuth2 redirect-URI variable. NextAuth derives the callback from the incoming request; the path is `/api/auth/callback/discord`. Register `https://<your-dashboard-origin>/api/auth/callback/discord` under **OAuth2 → Redirects** on your Discord application.

There is also no secure-cookie variable. NextAuth decides whether to use the `__Secure-` cookie prefix from the resolved URL scheme - serve the dashboard over HTTPS (and set `AUTH_URL` if a proxy rewrites the host) and it follows automatically.

Full reference for the app itself: [Dashboard Reference](dashboard.md).

## Docker Compose

`docker-compose.yml` at the repo root defines:

| Service | Purpose |
| :--- | :--- |
| `worker` | `LUMI_ROLE=worker` - Discord WS + all bot logic. Always runs. |
| `lumi-dev` (profile `development`) | Dev container with the repo (and a sibling `../lumi-addons`) bind-mounted, pretty/debug logging, interactive TTY. |
| `worker-scale` (profile `scale`) | A second worker replica for local cluster testing. |
| `scheduler` (profile `scale`) | `LUMI_ROLE=scheduler`. |
| `dashboard` (profile `dashboard`) | Web dashboard on `${DASHBOARD_PORT:-8080}`. **Not usable yet** - the shared `Dockerfile` has no `next build` stage, so `next start` exits with *"Could not find a production build in the '.next' directory"*. Run the dashboard outside Docker; see [Dashboard Reference § Running it](dashboard.md#running-it). |
| `postgres` | `postgres:17`, primary database. |
| `pgbouncer` | Connection pooler in front of Postgres, transaction pool mode, port 6432. Point `POSTGRES_URL` at this, not directly at `postgres`. |
| `redis` | `redis:7-alpine`, AOF persistence, `maxmemory 128mb` / `noeviction`. |
| `nirn-proxy` (profile `scale`) | Shared Discord REST rate-limit proxy across replicas. |
| `otel-collector`, `tempo`, `prometheus`, `grafana` (profile `observability`) | Full tracing/metrics stack, configs under `./config/observability/`. |

All app services `depends_on` Postgres, pgbouncer, and Redis with `condition: service_healthy`. The dashboard talks to `worker` directly over an internal HTTP RPC port (`RPC_HTTP_PORT`, never published to the host) - no extra service to bring up. Bring up the minimal stack with:

```bash
docker compose up worker postgres pgbouncer redis
```

Add `--profile scale` for a second worker + scheduler, or `--profile observability` for the full metrics/tracing stack. `--profile dashboard` is not usable yet - see the table above.

## Kubernetes (`deploy/k8s/`)

| Manifest | Kind | Purpose |
| :--- | :--- | :--- |
| `namespace.yaml` | `Namespace` `lumi` | |
| `configmap.yaml` | `ConfigMap` `lumi-env` | Non-secret env: Redis/Postgres connection info, internal RPC HTTP host/port, OTel/metrics settings, `CLUSTER_NAME: "lumi-prod"`, `SCHEDULER_LEADER_LOCK: "true"`. |
| `secret.example.yaml` | `Secret` template | Copy to `secret.yaml` and fill in - **never commit the filled version**. In real production, use Sealed Secrets or a vault instead of a plain `Secret` manifest. |
| `lumi-data-pvc.yaml` | `PersistentVolumeClaim` | `ReadWriteMany`, 5Gi - shared storage for downloaded addon repo files (addon *metadata* lives in Postgres; the files themselves live here). |
| `migrate-job.yaml` | `Job` | Runs `prisma migrate deploy` once, before rollout, so scaled workers don't race the same DDL. |
| `worker-statefulset.yaml` | `StatefulSet` + headless `Service` | The sharded worker fleet. `replicas: 1` by default - scaling past 1 means giving each replica a disjoint `SHARD_LIST` and setting `CLUSTER_NAME` so the dashboard's fleet view can tell them apart. `podManagementPolicy: Parallel`, rolling updates `maxUnavailable: 1`. Readiness/liveness on `/readyz` / `/healthz`, `preStop` sleeps 15s before termination for a graceful drain. |
| `scheduler-deployment.yaml` | `Deployment` | `replicas: 1`, `strategy: Recreate` - guarantees exactly one BullMQ owner at a time. |
| `nirn-proxy-deployment.yaml` | `Deployment` + `Service` | `replicas: 2`, stateless Discord REST proxy shared by worker replicas. |

There is **no dashboard manifest**. `secret.example.yaml` carries `DISCORD_OAUTH2_CLIENT_SECRET` and `DASHBOARD_SESSION_SECRET` (the names `apps/dashboard/src/lib/env.ts` reads) so the Secret is ready when one is written, but nothing in `deploy/k8s/` consumes them today.

Deploy order: namespace → secrets/configmap → PVC → `migrate-job` (wait for completion) → `nirn-proxy` → `scheduler` → `worker`.

Worker replica count is a manual shard-assignment decision, not autoscaled: pick a shards-per-replica target (16-32 is a reasonable starting point) and divide your total shard count by it, then `kubectl scale statefulset/worker --replicas=<n>`.

See `deploy/k8s/README.md` for the full walkthrough.
