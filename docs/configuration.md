# Configuration Reference

## Environment Variables

Copy `.env.example` to `.env` and fill in the required values.

| Variable | Default | Required | Description |
| :--- | :--- | :---: | :--- |
| `BOT_TOKEN` | - | ✅ | Discord Bot Token |
| `CLIENT_ID` | - | ✅ | Discord Application Client ID |
| `POSTGRES_URL` | `postgresql://lumi:lumi@localhost:6432/lumi` | ✅ | PgBouncer connection pool URI (port 6432) |
| `DIRECT_POSTGRES_URL` | `postgresql://lumi:lumi@localhost:5432/lumi` | ✅ | Direct PostgreSQL URI for Prisma migrations (port 5432) |
| `REDIS_HOST` | `localhost` | ✅ | Redis hostname (ignored when `REDIS_SENTINELS` is set) |
| `REDIS_PORT` | `6379` | ✅ | Redis port (ignored when `REDIS_SENTINELS` is set) |
| `REDIS_PASSWORD` | - | - | Redis authentication password |
| `REDIS_CACHE_DB` | `0` | - | Redis logical DB index used for cache/session keys |
| `REDIS_SENTINELS` | - | - | Comma-separated `host:port` list of Sentinel nodes; enables HA mode instead of `REDIS_HOST`/`REDIS_PORT` |
| `REDIS_SENTINEL_NAME` | `mymaster` | - | Master name as registered with Sentinel |
| `REDIS_SENTINEL_PASSWORD` | - | - | Password for connecting to the Sentinels themselves (separate from `REDIS_PASSWORD`) |
| `RABBITMQ_URL` | `amqp://lumi:lumi@localhost:5672` | ✅ | RabbitMQ AMQP broker URI (used for RPC bridging and cross-process events) |
| `LUMI_ROLE` | `worker` | - | Runtime process role: `worker` (Discord WebSocket + all bot logic) or `scheduler` (BullMQ tasks only) |
| `CLUSTER_NAME` | - | - | Enables multi-replica shard coordination via `@lumi/sharding`. Every replica sharing a name is assigned a disjoint shard range. Unset means single-process mode. |
| `DISCORD_PROXY_URL` | - | - | Base URL of a shared Discord REST proxy (`nirn-proxy`). Required when running more than one worker replica so REST rate-limit buckets are coordinated across processes. |
| `OTEL_ENABLED` | `false` | - | Enable OpenTelemetry OTLP tracing |
| `METRICS_ENABLED` | `true` | - | Enable Prometheus metrics endpoint |
| `METRICS_PORT` | `9090` | - | Prometheus `/metrics` HTTP port |
| `DASHBOARD_PORT` | `8080` | - | Web admin panel HTTP port |
| `DISCORD_OAUTH2_CLIENT_SECRET` | - | - | OAuth2 secret for dashboard login |

## Branding & Config Files

- **`config/bot.ts`** - Activity/presence settings, embed colors, support URLs, pagination limits.
- **`config/emojis.ts`** - Unicode and custom Discord emoji overrides used by the card renderer.
- **`config/observability/`** - Prometheus scrapers, OpenTelemetry collector, and Grafana dashboard configs.

## Docker Compose Profiles

| Profile | What it starts |
| :--- | :--- |
| `default` | Worker + Postgres + PgBouncer + Redis + RabbitMQ |
| `scale` | Worker replicas + Scheduler + `nirn-proxy` REST rate-limit proxy |
| `dashboard` | Web admin panel on `:8080` |
| `observability` | OTel Collector + Prometheus + Grafana + Tempo |

```bash
# Launch full scaled-out cluster with dashboard and observability stack
docker compose --profile scale --profile dashboard --profile observability up -d
```

## Kubernetes

Production manifests are in `deploy/k8s/`:

```bash
kubectl apply -f deploy/k8s/namespace.yaml
kubectl apply -f deploy/k8s/configmap.yaml
kubectl apply -f deploy/k8s/secret.example.yaml
kubectl apply -f deploy/k8s/migrate-job.yaml
kubectl apply -f deploy/k8s/worker-statefulset.yaml
kubectl apply -f deploy/k8s/scheduler-deployment.yaml
```

The worker runs as a StatefulSet because each replica owns real per-shard state
(WebSocket connection and resumable session). `replicas:` is a deliberate
shards-per-replica decision, not an autoscaler target - see
[architecture.md](architecture.md#horizontal-scaling). Scaling past one replica
requires `CLUSTER_NAME` in the ConfigMap, and `DISCORD_PROXY_URL` pointing at a
`nirn-proxy` Service.
