# Configuration Reference

## Environment Variables

Copy `.env.example` to `.env` and fill in the required values.

| Variable | Default | Required | Description |
| :--- | :--- | :---: | :--- |
| `BOT_TOKEN` | — | ✅ | Discord Bot Token |
| `CLIENT_ID` | — | ✅ | Discord Application Client ID |
| `POSTGRES_URL` | `postgresql://lumi:lumi@localhost:5432/lumi` | ✅ | PgBouncer pool URI |
| `DIRECT_POSTGRES_URL` | same | ✅ | Direct URI for Prisma migrations |
| `REDIS_URL` | `redis://localhost:6379` | ✅ | Redis connection string |
| `RABBITMQ_URL` | `amqp://lumi:lumi@localhost:5672` | ✅ | RabbitMQ URI |
| `LUMI_ROLE` | `monolith` | — | `monolith` / `gateway` / `worker` / `scheduler` |
| `TRANSPORT` | `inproc` | — | `inproc` / `streams` (Redis) / `nats` |
| `OTEL_ENABLED` | `false` | — | Enable OpenTelemetry tracing |
| `METRICS_ENABLED` | `true` | — | Enable Prometheus metrics |
| `METRICS_PORT` | `9090` | — | Prometheus `/metrics` port |
| `DASHBOARD_PORT` | `8080` | — | Web admin panel port |
| `DISCORD_OAUTH2_CLIENT_SECRET` | — | — | OAuth2 secret for dashboard login |

## Branding & Config Files

- **`config/bot.json`** — Activity/presence settings, embed colors, support URLs, permission tier labels, pagination limits.
- **`config/emojis.json`** — Unicode and custom Discord emoji overrides used by the card renderer.

## Docker Compose Profiles

| Profile | What it starts |
| :--- | :--- |
| `default` | Worker + Postgres + PgBouncer + Redis + RabbitMQ |
| `scale` | Gateway + Worker pool + Scheduler + Rate-limit proxy |
| `scale-nats` | Same as `scale` but uses NATS JetStream |
| `dashboard` | Web admin panel on `:8080` |
| `observability` | OTel Collector + Prometheus + Grafana + Tempo |

```bash
# Launch everything at once
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
