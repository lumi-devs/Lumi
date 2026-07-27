# `@lumi/gateway` (`apps/gateway`)

<div align="center">
  <img src="https://img.shields.io/badge/Role-Gateway%20WS-blue?style=for-the-badge" alt="Role">
  <img src="https://img.shields.io/badge/Transport-Redis%20Streams%20%7C%20NATS-orange?style=for-the-badge" alt="Transport">
  <img src="https://img.shields.io/badge/Zero%20Commands-Yes-brightgreen?style=for-the-badge" alt="Zero Commands">
</div>

> Lightweight, high-throughput gateway application dedicated to managing Discord WebSocket shard connections and streaming raw dispatch envelopes to `@lumi/event-bus`.

---

## 📦 Role & Overview

`apps/gateway` executes under `LUMI_ROLE=gateway` in distributed scale-out Lumi deployments.

### Key Responsibilities
- **WebSocket Shard Management**: Holds active Discord WebSocket connections using `@discordjs/ws`.
- **Dynamic Cluster Planning**: Integrates `@lumi/sharding` for Redis-backed cluster coordination, automated epoch assignments, and identify rate throttling.
- **Event Envelope Streaming**: Packages raw WebSocket dispatches into `RawGatewayEnvelope` objects and streams them onto Redis Streams or NATS JetStream.
- **Gateway Pre-acknowledgment**: Optionally pre-acknowledges slash command interactions (`INTERACTION_DEFER_AT_GATEWAY=true`) to satisfy Discord's 3-second SLA under heavy load.
- **Zero Command Execution**: Runs no feature modules, listeners, or database queries.

---

## 🏛️ Monorepo Architecture Position

```
Discord WebSocket ──▶ apps/gateway ──@lumi/event-bus (Streams/NATS)──▶ apps/worker (Stateless)
```

`apps/gateway` requires a distributed event bus (`TRANSPORT=streams` or `TRANSPORT=nats`). If launched with `TRANSPORT=inproc`, it exits with a fatal error.

---

## ⚙️ Environment Variables

| Variable | Description | Required / Default | Notes |
|---|---|---|---|
| `BOT_TOKEN` | Discord Bot Token | ✅ **Required** | Must be valid token |
| `TRANSPORT` | Distributed event bus backend (`streams` or `nats`) | `streams` | `inproc` forbidden |
| `INTERACTION_DEFER_AT_GATEWAY` | Pre-acknowledge slash commands at Gateway | `false` | Prevents 3s timeouts |
| `EVENT_STREAM_MAXLEN` | Redis stream capping limit | `100000` | Capping parameter |
| `CLUSTER_NAME` | Gateway cluster name for multi-replica coordination | `null` (standalone) | Enables sharding locks |
| `LUMI_CONSUMER_ID` / `HOSTNAME` | Unique replica node identifier | Hostname | Cluster member ID |
| `REDIS_HOST` / `REDIS_PORT` | Redis server parameters | `localhost:6379` | Required for `streams` |
| `NATS_URL` / `NATS_SERVERS` | NATS connection URI(s) | `nats://localhost:4222` | Required for `nats` |
| `METRICS_PORT` | Prometheus metrics port | `9090` | Exposes Gateway stats |

---

## 💻 Usage & Execution Snippet

```bash
# Run Gateway node manually
LUMI_ROLE=gateway TRANSPORT=streams bun apps/gateway/src/main.ts

# Docker execution
docker compose --profile distributed up -d gateway
```
