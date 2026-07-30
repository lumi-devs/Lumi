# Configuration Reference

## Environment Variables

Copy `.env.example` to `.env` and fill in the required values.

| Variable | Default | Required | Description |
| :--- | :--- | :---: | :--- |
| `BOT_TOKEN` | — | ✅ | Discord Bot Token |
| `CLIENT_ID` | — | ✅ | Discord Application Client ID |
| `POSTGRES_URL` | `postgresql://lumi:lumi@localhost:6432/lumi` | ✅ | PgBouncer connection pool URI (port 6432) |
| `DIRECT_POSTGRES_URL` | `postgresql://lumi:lumi@localhost:5432/lumi` | ✅ | Direct PostgreSQL URI for Prisma migrations (port 5432) |
| `REDIS_HOST` | `localhost` | ✅ | Redis hostname |
| `REDIS_PORT` | `6379` | ✅ | Redis port |
| `REDIS_PASSWORD` | — | — | Redis authentication password |
| `RABBITMQ_URL` | `amqp://lumi:lumi@localhost:5672` | ✅ | RabbitMQ AMQP broker URI |
| `LUMI_ROLE` | `monolith` | — | Runtime process role: `monolith` / `gateway` / `worker` / `scheduler` |
| `TRANSPORT` | `streams` | — | Inter-process event transport (`streams` via Redis Streams) |
| `OTEL_ENABLED` | `false` | — | Enable OpenTelemetry OTLP tracing |
| `METRICS_ENABLED` | `true` | — | Enable Prometheus metrics endpoint |
| `METRICS_PORT` | `9090` | — | Prometheus `/metrics` HTTP port |
| `DASHBOARD_PORT` | `8080` | — | Web admin panel HTTP port |
| `DISCORD_OAUTH2_CLIENT_SECRET` | — | — | OAuth2 secret for dashboard login |

## Branding & Config Files

- **`config/bot.ts`** — Activity/presence settings, embed colors, support URLs, pagination limits.
- **`config/emojis.ts`** — Unicode and custom Discord emoji overrides used by the card renderer.
- **`config/observability/`** — Prometheus scrapers, OpenTelemetry collector, and Grafana dashboard configs.

## Docker Compose Profiles

| Profile | What it starts |
| :--- | :--- |
| `default` | Worker + Postgres + PgBouncer + Redis + RabbitMQ |
| `scale` | Gateway + Worker pool + Scheduler + Rate-limit proxy |
| `dashboard` | Web admin panel on `:8080` |
| `observability` | OTel Collector + Prometheus + Grafana + Tempo |

```bash
# Launch full scaled-out cluster with dashboard and observability stack
docker compose --profile scale --profile dashboard --profile observability up -d
```

## Kubernetes (KEDA)

Production manifests are in `deploy/k8s/`:

```bash
kubectl apply -f deploy/k8s/namespace.yaml
kubectl apply -f deploy/k8s/configmap.yaml
kubectl apply -f deploy/k8s/secret.example.yaml
kubectl apply -f deploy/k8s/migrate-job.yaml
kubectl apply -f deploy/k8s/gateway-statefulset.yaml
kubectl apply -f deploy/k8s/worker-deployment.yaml
kubectl apply -f deploy/k8s/worker-scaledobject.yaml
kubectl apply -f deploy/k8s/scheduler-deployment.yaml
```
