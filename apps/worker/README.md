# `@lumi/worker` (`apps/worker`)

<div align="center">
  <img src="https://img.shields.io/badge/Role-Stateless%20Worker-blue?style=for-the-badge" alt="Role">
  <img src="https://img.shields.io/badge/Autoscaling-KEDA-purple?style=for-the-badge" alt="Autoscaling">
  <img src="https://img.shields.io/badge/Stateless-Yes-brightgreen?style=for-the-badge" alt="Stateless">
</div>

> Stateless worker application consuming Gateway dispatch events, executing feature modules, handling commands, responding to RPC requests, and executing background task effects.

---

## 📦 Role & Overview

`apps/worker` runs under `LUMI_ROLE=worker` in a distributed deployment topology.

### Key Responsibilities
- **Zero Discord WebSockets**: Holds zero Discord WebSocket connections (`roleOpensWS = false`).
- **Gateway Payload Consumption**: Consumes `RawGatewayEnvelope` payloads off `@lumi/event-bus` (`streams` or `nats`) via `RawGatewayConsumer`.
- **Sapphire Client Dispatching**: Patches Sapphire's internal WS client to dispatch events directly to registered `ModuleListener` and `BaseCommand` handlers.
- **RabbitMQ RPC Server**: Responds to configuration RPC requests from `@lumi/dashboard` via RabbitMQ.
- **Task Effect Execution**: Processes background task execution triggers (`lumi.scheduler.fire:<name>`) published by `apps/scheduler`.

---

## 🏛️ Monorepo Architecture Position

```
apps/gateway ──@lumi/event-bus──▶ apps/worker (RawGatewayConsumer) ──▶ Sapphire Client ──▶ Modules & Commands
```

Because `apps/worker` nodes are completely stateless regarding Discord WebSocket connections, workers can scale horizontally from 1 to N instances behind Redis consumer groups or NATS JetStream subscriptions.

---

## ⚙️ Environment Variables

| Variable | Description | Required / Default | Notes |
|---|---|---|---|
| `LUMI_ROLE` | Set to `worker` | `worker` | Default worker role |
| `BOT_TOKEN` | Discord Bot Token | ✅ **Required** | REST API calls |
| `TRANSPORT` | Event bus transport backend (`streams`, `nats`, `inproc`) | `streams` | Event stream |
| `LUMI_CONSUMER_ID` / `HOSTNAME` | Unique worker consumer member ID | Hostname | Consumer group ID |
| `DATABASE_URL` | PostgreSQL connection string | ✅ **Required** | Persistence |
| `REDIS_HOST` / `REDIS_PORT` | Redis server host & port | `localhost:6379` | Cache & streams |
| `RABBITMQ_URL` | RabbitMQ connection URI for RPC & fanout | `amqp://guest:guest@localhost:5672` | Dashboard RPC |
| `METRICS_PORT` | Prometheus metrics port | `9090` | Exposes stream lag |

---

## 💻 Usage & Execution Snippet

```bash
# Run Worker node manually
LUMI_ROLE=worker TRANSPORT=streams bun apps/worker/src/main.ts

# Docker execution
docker compose --profile distributed up -d worker
```
