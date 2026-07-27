# 🛠️ @lumi/worker

<div align="center">
  <img src="https://img.shields.io/badge/Status-Production_Ready-brightgreen?style=for-the-badge" alt="Status">
  <img src="https://img.shields.io/badge/Bun-1.3+-black?style=for-the-badge&logo=bun" alt="Bun">
  <img src="https://img.shields.io/badge/TypeScript-5.9-blue?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Framework-Sapphire_v5-blue?style=for-the-badge" alt="Sapphire">
  <img src="https://img.shields.io/badge/Role-worker%20%7C%20consumer-purple?style=for-the-badge" alt="Role">
</div>

<br />

The **Lumi Worker** (`@lumi/worker`) is the primary stateless execution engine of the Lumi bot ecosystem. It processes raw Discord gateway events consumed from the event bus, executes slash and chat commands, manages per-guild module logic, serves web dashboard RabbitMQ RPC requests, and handles database persistence.

---

## 📖 Table of Contents

- [Overview](#-overview)
- [Architecture & Data Flow](#-architecture--data-flow)
- [Built-in Modules & Capability Matrix](#-built-in-modules--capability-matrix)
- [Configuration & Environment Variables](#-configuration--environment-variables)
- [Development & Running Instructions](#-development--running-instructions)
- [Observability & Health Probes](#-observability--health-probes)

---

## 🌟 Overview

The worker application serves as the core processing engine in both standalone and microservices deployments:

- **WS-Suppressed Consumer Execution**: In distributed mode (`LUMI_ROLE=consumer`), WebSocket connection initiation is completely disabled. Packets arrive asynchronously via `RawGatewayConsumer` over Redis Streams.
- **Sapphire Framework Foundation**: Built on Sapphire Framework v5, providing modular command registration, listener stores, argument parsing, and command execution pipelines.
- **Dynamic Module Store**: Loads built-in feature modules (`afk`, `core`, `dashboard`, `filter`, `logging`, `mod`, `tempvc`, `utility`) and dynamically mounts external third-party addons from `/lumi-addons` or custom development paths (`LUMI_DEV_PATHS`).
- **Dashboard RPC Handler**: Serves asynchronous RabbitMQ RPC requests emitted by `@lumi/dashboard` to fetch live guild configurations and apply module state changes.
- **High-Performance Caching**: Integrates `RedisEntityCache` and an `InvalidationBus` to cache guild configurations and user states, reducing database load.
- **Horizontal Elasticity**: Stateless design allows worker instances to scale dynamically from 1 to 100+ replicas (e.g. via Kubernetes KEDA) based on consumer stream lag.

---

## 🏗️ Architecture & Data Flow

### Event Ingestion & Execution Pipeline

```mermaid
flowchart TD
    subgraph Event Transport Backplane
        EB{Redis Streams<br/>rawGatewayStream}
    end

    subgraph Worker Process (apps/worker)
        RGC[RawGatewayConsumer]
        Sapphire[Sapphire Framework Engine]
        MS[ModuleStore<br/>Built-in & Addon Modules]
        EC[(Redis Entity Cache)]
    end

    subgraph External Infrastructure
        DB[(PostgreSQL 17 / PgBouncer)]
        RMQ[RabbitMQ RPC Exchange]
        Discord[Discord REST API]
        Dash[apps/dashboard]
    end

    EB -->|Raw Gateway Packets| RGC
    RGC -->|Inject Packet into Client| Sapphire
    Sapphire -->|Lookup Guild Settings| EC
    EC <-->|Cache Miss / Sync| DB

    Sapphire -->|Execute Feature Logic| MS
    MS -->|REST Actions / Interactivity| Discord

    Dash <-->|RPC Request/Reply| RMQ
    RMQ <-->|DashboardModule Handler| Worker
    Worker -->|Update Guild Config| DB
```

---

## 🧩 Built-in Modules & Capability Matrix

Workers load and execute the following built-in modules located in `packages/core/src/modules/`:

| Module Name | Description | Key Features |
|---|---|---|
| `afk` | Automated AFK status manager | Sets AFK reason on user command; removes AFK and notifies mentions upon user activity. |
| `core` | Core framework administration | Handles bot ping, system info, prefix management, and health checks. |
| `dashboard` | Web dashboard RPC bridge | Exposes `guild.dashboard.get`, `guild.module.toggle`, and `guild.config.set` RPC actions. |
| `filter` | Content & word filtering system | Automates deletion of prohibited words, invite links, and spam patterns. |
| `logging` | Server audit & activity logger | Logs member joins/leaves, deleted messages, edited messages, and role changes to configured channels. |
| `mod` | Server moderation suite | Executes kick, ban, softban, mute, timeout, purge, and infraction logging. |
| `tempvc` | Dynamic temporary voice channels | Automatically creates temporary voice channels on join and deletes them when empty. |
| `utility` | Community utility tools | Server info, user info, avatar display, poll creation, and role pickers. |

---

## ⚙️ Configuration & Environment Variables

Configure `@lumi/worker` using environment variables:

| Environment Variable | Required | Default | Description |
|---|:---:|:---:|---|
| `BOT_TOKEN` | **Yes** | — | Discord Bot Token from the Discord Developer Portal. |
| `LUMI_ROLE` | No | `worker` | Service role (`worker` \| `consumer`). |
| `TRANSPORT` | No | `streams` | Event bus transport mechanism (`streams`). |
| `LUMI_CONSUMER_ID` | No | `worker-1` | Unique consumer ID for stream consumer group tracking. |
| `POSTGRES_URL` | **Yes** | — | PostgreSQL pooled connection string (PgBouncer). |
| `DIRECT_POSTGRES_URL` | **Yes** | — | PostgreSQL direct connection string (used for schema migrations). |
| `REDIS_HOST` | No | `localhost` | Redis server hostname. |
| `REDIS_PORT` | No | `6379` | Redis server network port. |
| `REDIS_PASSWORD` | No | — | Redis authentication password. |
| `REDIS_CACHE_DB` | No | `0` | Redis database index for entity caching. |
| `RABBITMQ_URL` | **Yes** | — | RabbitMQ broker URL for dashboard RPC calls. |
| `LUMI_DEV_PATHS` | No | `/lumi-addons` | Colon-separated paths to external addon directories. |
| `METRICS_ENABLED` | No | `true` | Enables HTTP metrics and health check server. |
| `METRICS_PORT` | No | `9090` | Network port for Prometheus metrics and health probes. |

---

## 🚀 Development & Running Instructions

### Standalone Development Mode (Single Process)

In development, a worker can run in standalone mode (`LUMI_ROLE=worker`), maintaining its own Discord Gateway WebSocket connection:

```bash
# Run standalone bot worker
bun apps/worker/src/main.ts
```

### Distributed Consumer Mode (Production)

In production, run workers with `LUMI_ROLE=consumer` behind `@lumi/gateway`:

```bash
LUMI_ROLE="consumer" TRANSPORT="streams" LUMI_CONSUMER_ID="worker-node-1" bun apps/worker/src/main.ts
```

### Docker Compose

Run workers in scaled mode using Docker Compose:

```bash
docker compose --profile scale up -d worker-scale
```

---

## 📊 Observability & Health Probes

The worker exposes an HTTP server on `METRICS_PORT` (default `9090`).

### Endpoint Reference

| Endpoint | Method | Status Code | Description |
|---|---|:---:|---|
| `/healthz` | `GET` | `200` | Process liveness probe. |
| `/readyz` | `GET` | `200` / `503` | Evaluates system probes (`postgres`, `redis`, `rabbitmq`, `raw-gateway-consumer`). |
| `/metrics` | `GET` | `200` | Exports Prometheus runtime, stream lag, and command execution metrics. |

### Registered Readiness Probes

- `postgres`: Confirms PostgreSQL connectivity via Prisma `SELECT 1`.
- `redis`: Confirms Redis `PING` / `PONG` response.
- `rabbitmq`: Verifies active connection to the RabbitMQ broker.
- `raw-gateway-consumer`: Confirms that `RawGatewayConsumer` is actively reading from the event stream (`LUMI_ROLE=worker`).
