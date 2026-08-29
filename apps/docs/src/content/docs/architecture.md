---
title: "Architecture & System Topology"
description: "Process roles, the Redis Streams event bus, sharding/clustering, the database layer, command registration, and observability."
category: "Core Architecture"
---

# Architecture & System Topology

## Process Model

Lumi runs as two decoupled applications under `apps/`:

| App | Discord Gateway? | Purpose |
| :--- | :--- | :--- |
| [`apps/worker`](https://github.com/lumi-devs/Lumi/blob/main/apps/worker) | Yes | Owns the Discord WebSocket gateway connection(s) and executes commands, modules, listeners, and interaction handlers in-process. |
| [`apps/dashboard`](https://github.com/lumi-devs/Lumi/blob/main/apps/dashboard) | No | Next.js (App Router) administration web panel. Communicates with `worker` exclusively via an internal HTTP RPC bridge. |

There is no separate scheduler daemon or role-segregated worker. Every worker child process is identical, maintaining real Discord gateway shard connections and loading all enabled modules.

`apps/worker/src/main.ts` acts as a lightweight **manager process**: it instantiates discord.js's `ShardingManager` and spawns one child OS process per shard (`apps/worker/src/shard-client.ts`), where the actual `LumiClient` runs:

```ts
// apps/worker/src/main.ts (manager - no telemetry, no client)
const manager = new ShardingManager(shardFile, {
  token,
  totalShards: envInt("TOTAL_SHARDS") ?? "auto",
  shardList: envShardList() ?? "auto",
  respawn: true,
});
await manager.spawn({ amount: "auto", timeout: -1 });
```

```ts
// apps/worker/src/shard-client.ts (spawned once per shard)
import "./telemetry.js";
import "@lumi/core/setup";
import { bootstrapClientApp } from "@lumi/core";

await bootstrapClientApp({});
```

Telemetry bootstrap is imported first in `shard-client.ts` as a side-effect so that OpenTelemetry auto-instrumentation hooks into HTTP, Postgres, and Redis clients before any modules load.

---

### Primary Shard Election

Singleton duties—tasks that exactly one process per deployment should perform—are gated by `isPrimaryShard()` (`packages/core/src/lib/env.ts`):

```ts
export function isPrimaryShard(): boolean {
  if (!process.env["SHARDING_MANAGER"]) return true;
  const raw = process.env["SHARDS"];
  if (!raw) return true;
  try {
    const parsed: unknown = JSON.parse(raw);
    const ids = Array.isArray(parsed) ? parsed : [parsed];
    return ids.includes(0);
  } catch {
    return true;
  }
}
```

A process not spawned under `ShardingManager` (such as a local dev run) is always primary. Under `ShardingManager`, the process holding **Shard ID `0`** is elected primary. Because Shard 0 is globally unique across the fleet, this provides a zero-coordination leader election without distributed locks.

The primary shard exclusively owns:
1. **HTTP RPC Bridge (`RPC_HTTP_PORT`, default `8091`)**: Serves the dashboard API.
2. **Prometheus Metrics (`METRICS_PORT`, default `9090`)**: Serves `/metrics`, `/healthz`, and `/readyz`.
3. **BullMQ Task Scheduler (`@sapphire/plugin-scheduled-tasks`)**: Evaluates cron patterns and delayed job schedules on Redis DB `1`.
4. **Readiness Probe Aggregation**: Aggregates Discord gateway readiness across all sibling shards in the pod before reporting `/readyz` as healthy.

Non-primary shards do not bind HTTP ports. However, all shards (primary and non-primary) consume fired tasks from the Redis Streams event bus to execute effects for the guilds they manage.

---

## Inter-Process Communication

Two distinct, isolated communication mechanisms exist:

1. **Task Scheduling → Execution (Redis Streams)**: Backed by `@lumi/event-bus` (`RedisStreamsBus.ts`). The primary shard dispatches fired BullMQ events to Redis Streams. Shard processes consume messages from their consumer group (`lumi-workers`) and execute handlers registered with `registerTaskFireHandler(name, mode, handler)`.
2. **Dashboard ↔ Worker (Internal HTTP RPC)**: Backed by `apps/dashboard/src/lib/rpc.ts` communicating directly with `packages/core/src/lib/rpc/http-server.ts` via `POST /rpc` on port `8091`. Authenticated via `Authorization: Bearer <RPC_INTERNAL_TOKEN>`.

```
┌────────────────────────┐                  ┌────────────────────────┐
│ apps/dashboard         │                  │ apps/worker            │
│ (Next.js App Router)   ├─────────────────►│ (Primary Shard 0)      │
│                        │ HTTP POST /rpc   │ • RPC Server (8091)    │
└────────────────────────┘                  │ • BullMQ Scheduler     │
                                            └──────────┬─────────────┘
                                                       │ Redis XADD
                                                       ▼
                                            ┌────────────────────────┐
                                            │ Redis Stream           │
                                            │ (lumi:events:*)        │
                                            └──────────┬─────────────┘
                                                       │
                                   ┌───────────────────┴───────────────────┐
                                   │ XREADGROUP                            │ XREADGROUP
                                   ▼                                       ▼
                        ┌──────────────────────┐                ┌──────────────────────┐
                        │ Worker Shard 0       │                │ Worker Shard 1       │
                        │ (Executes Tasks)     │                │ (Executes Tasks)     │
                        └──────────────────────┘                └──────────────────────┘
```

### Redis Streams Bus Mechanics

- **Message Polling**: `XREADGROUP ... GROUP <group> <consumer> COUNT 16 BLOCK 5000`.
- **At-Least-Once Delivery**: Messages are acknowledged (`XACK`) only after successful execution.
- **Auto-Reclamation**: Background `XAUTOCLAIM` loop runs every `EVENT_STREAM_CLAIM_INTERVAL_MS` (default 30s) to reclaim messages idle past `EVENT_STREAM_CLAIM_MIN_IDLE_MS` (default 60s).
- **Dead Letter Queue (DLQ)**: When a poison message exceeds `EVENT_STREAM_MAX_DELIVERIES` (default 5), it is moved to `<stream>:dlq` and acknowledged off the active stream.
- **Stream Bounds**: Streams are trimmed using `XADD ... MAXLEN ~ 100000` (`EVENT_STREAM_MAXLEN`).

---

## Sharding & Clustering

`packages/sharding` manages cross-process shard telemetry. Shard allocation itself is managed by discord.js's native `ShardingManager`:

- **Spawning**: `apps/worker/src/main.ts` invokes `manager.spawn({ amount: "auto", timeout: -1 })`. `TOTAL_SHARDS=auto` queries Discord's recommendation; `SHARD_LIST` (e.g. `0,1,2,3`) restricts which shards a container spawns.
- **Telemetry Publishing**: Each shard publishes its heartbeat status, ping, and guild count to Redis with a TTL under `lumi:shards:<cluster>:<shardId>`.
- **Fault Recovery**: `respawn: true` on `ShardingManager` restarts dead child processes automatically.

---

## Database Layer

**PostgreSQL** via Prisma (`prisma/schema.prisma`, 27 models) is the system of record.

### The DatabaseService Facade

Modules must **never** touch `container.prisma` directly. All data access flows through `container.db` (`DatabaseService`), which delegates to 17 per-domain repositories:

- `container.db.global` (`GlobalRepository`)
- `container.db.config` (`ConfigRepository`)
- `container.db.modules` (`ModuleRepository`)
- `container.db.guildKV` (`GuildKVRepository`)
- `container.db.access` (`AccessRepository`)
- `container.db.permissions` (`PermissionRepository`)
- `container.db.downloader` (`DownloaderRepository`)
- `container.db.audit` (`AuditRepository`)
- `container.db.users` (`UserRepository`)
- `container.db.moderation` (`ModerationRepository`)
- `container.db.configHistory` (`ConfigHistoryRepository`)
- `container.db.configOverrides` (`ConfigOverrideRepository`)
- `container.db.afk` (`AfkRepository`)
- `container.db.modNotes` (`ModNoteRepository`)
- `container.db.appeals` (`AppealRepository`)
- `container.db.security` (`SecurityRepository`)
- `container.db.tempvc` (`TempVcRepository`)

### Caching & Invalidation

- **Cache-Aside**: Repositories leverage Redis `getOrSet` with TTLs defined in `RedisTTL`.
- **Invalidation Bus**: Shared cache keys are evicted via `container.invalidation.invalidate(...)` (`InvalidationBus`), which publishes eviction events across Redis pub/sub (`lumi:cache:invalidate`) so all shard processes clear their local caches synchronously.

---

## Dashboard Frontend

`apps/dashboard` is built on Next.js 16 (App Router), React 19, Tailwind CSS v4, and NextAuth.js (Auth.js v5):

- **Strict Isolation**: The dashboard never connects to PostgreSQL or Redis directly and does not hold the bot token.
- **Server-Only Bridge**: `apps/dashboard/src/lib/rpc.ts` is guarded with `import "server-only"`, ensuring RPC secrets and tokens cannot be bundled to the client.
- **Schema-Driven Forms**: Module configuration forms are generated dynamically from `@lumi/contracts` `ConfigField[]` definitions.
- **Authentication**: Discord OAuth2 via NextAuth.js, storing signed and encrypted JWT session cookies (`DASHBOARD_SESSION_SECRET`).
- **Authorization & IDOR Protection**: `requireGuild(guildId)` verifies permissions on every server component render and inside every Server Action.

---

## Command Registration

Every shard child registers its application slash commands with Discord on boot using Sapphire's command registry. Because Discord's bulk overwrite endpoint (`PUT /applications/{id}/commands`) is idempotent, concurrent registrations across shards settle safely without coordination.

---

## Observability

`packages/observability` configures tracing, metrics, and health probes:

- **OpenTelemetry Tracing**: Enabled via `OTEL_ENABLED=true`, exporting spans via OTLP HTTP (`http://otel-collector:4318`).
- **Prometheus Metrics**: Exported at `GET /metrics` on port `9090` (`METRICS_PORT`). Collects command execution counts, gateway latency, stream lag, event loop delays, and PostgreSQL connection pool stats.
- **Event-Loop Delay Monitoring**: `perf_hooks.monitorEventLoopDelay` tracks event-loop lag (`lumi_event_loop_delay_seconds`), exporting p50, p99, and max quantiles.
- **Health Probes**: `GET /healthz` (liveness) and `GET /readyz` (readiness). `markDraining()` flips `/readyz` to HTTP 503 immediately upon receiving `SIGTERM` so orchestrators drain traffic gracefully.


