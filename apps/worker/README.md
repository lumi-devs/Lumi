# 🛠️ @lumi/worker

<div align="center">
  <img src="https://img.shields.io/badge/Status-Production_Ready-brightgreen?style=for-the-badge" alt="Status">
  <img src="https://img.shields.io/badge/Bun-1.3+-black?style=for-the-badge&logo=bun" alt="Bun">
  <img src="https://img.shields.io/badge/TypeScript-5.9-blue?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Framework-Sapphire_v5-blue?style=for-the-badge" alt="Sapphire">
</div>

<br />

The **Lumi Worker** (`@lumi/worker`) is the primary execution engine of the Lumi bot ecosystem. It owns Lumi's Discord Gateway WebSocket connection, executes slash and chat commands, manages per-guild module logic, serves web dashboard RPC requests over an internal HTTP server, and handles database persistence.

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

The worker application serves as the core processing engine at every deployment size, from one process to a multi-replica cluster:

- **Owns the Gateway Connection**: The worker opens its own Discord Gateway WebSocket and handles the resulting dispatches in-process. Gateway ingestion and command/interaction handling are never split across processes - discord.js's internal packet handling assumes single-process invariants.
- **Sapphire Framework Foundation**: Built on Sapphire Framework v5, providing modular command registration, listener stores, argument parsing, and command execution pipelines.
- **Dynamic Module Store**: Loads built-in feature modules (`afk`, `core`, `dashboard`, `filter`, `logging`, `mod`, `tempvc`, `utility`) and dynamically mounts external third-party addons from `/lumi-addons` or custom development paths (`LUMI_DEV_PATHS`).
- **Dashboard RPC Handler**: Serves synchronous HTTP RPC requests from `@lumi/dashboard` (`packages/core/src/lib/rpc/http-server.ts`) to fetch live guild configurations and apply module state changes.
- **High-Performance Caching**: Integrates `RedisEntityCache` and an `InvalidationBus` to cache guild configurations and user states, reducing database load.
- **Sharding via discord.js `ShardingManager`**: `apps/worker/src/main.ts` is a lightweight manager process - it constructs a `ShardingManager` and spawns one child process per shard it owns (`apps/worker/src/shard-client.ts`, where the actual `LumiClient` lives). `TOTAL_SHARDS`/`SHARD_LIST` control which shards this replica spawns; `CLUSTER_NAME` namespaces the shard telemetry each child publishes to Redis for the dashboard's fleet view. Replica count is a deliberate shards-per-replica decision, not a queue-lag autoscaler target.
- **Zero-coordination primary shard**: exactly one process per pod - the one holding shard id `0` - binds the RPC HTTP server and `/metrics`, and owns BullMQ job *scheduling* (`isPrimaryShard()` in `packages/core/src/lib/env.ts`). Every shard, primary or not, still executes fired task effects for the guilds it holds.

---

## 🏗️ Architecture & Data Flow

### Event Ingestion & Execution Pipeline

```mermaid
flowchart TD
    subgraph Discord
        WS[Discord Gateway<br/>WebSocket]
    end

    subgraph Worker Process (apps/worker)
        SH[LumiClient<br/>owned shards]
        Sapphire[Sapphire Framework Engine]
        MS[ModuleStore<br/>Built-in & Addon Modules]
        EC[(Redis Entity Cache)]
    end

    subgraph External Infrastructure
        DB[(PostgreSQL 17 / PgBouncer)]
        Discord[Discord REST API]
        Dash[apps/dashboard]
    end

    WS -->|Gateway Dispatch| SH
    SH -->|In-process Event Emission| Sapphire
    Sapphire -->|Lookup Guild Settings| EC
    EC <-->|Cache Miss / Sync| DB

    Sapphire -->|Execute Feature Logic| MS
    MS -->|REST Actions / Interactivity| Discord

    Dash <-->|Internal HTTP RPC :8091| SH
    SH -->|Update Guild Config| DB
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
| `BOT_TOKEN` | **Yes** | - | Discord Bot Token from the Discord Developer Portal. |
| `LUMI_CONSUMER_ID` | No | `worker-1` | Unique consumer ID for stream consumer group tracking and cluster replica identity. |
| `TOTAL_SHARDS` | No | `auto` | Pin the total shard count instead of following Discord's recommendation. |
| `SHARD_LIST` | No | `auto` | Comma-separated shard IDs this replica's `ShardingManager` spawns children for. |
| `CLUSTER_NAME` | No | - | Namespaces shard telemetry for the dashboard's fleet view across replicas. Unset means single-process mode. |
| `DISCORD_PROXY_URL` | No | - | Shared Discord REST proxy (`nirn-proxy`) base URL. Set this whenever more than one worker replica is running. |
| `POSTGRES_URL` | **Yes** | - | PostgreSQL pooled connection string (PgBouncer). |
| `DIRECT_POSTGRES_URL` | **Yes** | - | PostgreSQL direct connection string (used for schema migrations). |
| `REDIS_HOST` | No | `localhost` | Redis server hostname. |
| `REDIS_PORT` | No | `6379` | Redis server network port. |
| `REDIS_PASSWORD` | No | - | Redis authentication password. |
| `REDIS_CACHE_DB` | No | `0` | Redis database index for entity caching. |
| `RPC_HTTP_HOST` | No | `127.0.0.1` | Bind host for the internal RPC HTTP server the dashboard calls into. Set `0.0.0.0` when the dashboard runs in a separate container. |
| `RPC_INTERNAL_TOKEN` | In production | - | Shared secret the dashboard must present as `Authorization: Bearer`; the RPC server refuses to start without it under `NODE_ENV=production`. |
| `RPC_HTTP_PORT` | No | `8091` | Bind port for the internal RPC HTTP server. Never published to the host. |
| `LUMI_DEV_PATHS` | No | `/lumi-addons` | Colon-separated paths to external addon directories. |
| `METRICS_ENABLED` | No | `true` | Enables HTTP metrics and health check server. |
| `METRICS_PORT` | No | `9090` | Network port for Prometheus metrics and health probes. |

---

## 🚀 Development & Running Instructions

### Single-Process Mode (Development & Small Deployments)

With `TOTAL_SHARDS`/`SHARD_LIST` unset, `ShardingManager` spawns one child for every shard Discord recommends, all from this one pod:

```bash
bun apps/worker/src/main.ts
```

### Clustered Mode (Multi-Replica Production)

Set `CLUSTER_NAME` on every replica and give each a unique `LUMI_CONSUMER_ID` and a disjoint `SHARD_LIST`:

```bash
CLUSTER_NAME="lumi-prod" LUMI_CONSUMER_ID="worker-node-1" \
DISCORD_PROXY_URL="http://nirn-proxy:8080" \
bun apps/worker/src/main.ts
```

### Docker Compose

Run additional worker replicas and the shared REST proxy using Docker Compose:

```bash
docker compose --profile scale up -d
```

---

## 📊 Observability & Health Probes

The worker exposes an HTTP server on `METRICS_PORT` (default `9090`).

### Endpoint Reference

| Endpoint | Method | Status Code | Description |
|---|---|:---:|---|
| `/healthz` | `GET` | `200` | Process liveness probe. |
| `/readyz` | `GET` | `200` / `503` | Evaluates system probes (`postgres`, `redis`, `discord`, and, primary shard only, `scheduler-tasks`). |
| `/metrics` | `GET` | `200` | Exports Prometheus runtime, stream lag, and command execution metrics. |

Only the primary shard (the one holding shard id `0`) binds this HTTP server at all - see [Sharding via discord.js `ShardingManager`](#-overview) above.

### Registered Readiness Probes

- `postgres`: Confirms PostgreSQL connectivity via Prisma `SELECT 1`.
- `redis`: Confirms Redis `PING` / `PONG` response.
- `discord`: Confirms this shard's gateway connection is ready; the primary shard aggregates this across every sibling shard in the pod via shard telemetry.
- `scheduler-tasks` (primary shard only): Confirms BullMQ is reachable.
