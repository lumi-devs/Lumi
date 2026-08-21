---
title: "Architecture & System Topology"
description: "Process roles, the Redis Streams event bus, sharding/clustering, the database layer, command registration, and observability."
---

## Process roles

Lumi runs as two independent apps under `apps/`, plus `apps/worker` deployed twice under
different roles:

| App | Role | Discord gateway? | Purpose |
| :--- | :--- | :--- | :--- |
| [`apps/worker`](https://github.com/lumi-devs/Lumi/blob/main/apps/worker/README.md) | `worker` | Yes | Owns the Discord WebSocket connection(s) and runs every command, module, and interaction handler in-process. |
| [`apps/worker`](https://github.com/lumi-devs/Lumi/blob/main/apps/worker/README.md) | `scheduler` | No | Same image/entrypoint, run with `LUMI_ROLE=scheduler`. Owns BullMQ delayed/cron job queues. Never opens a gateway connection. |
| [`apps/dashboard`](https://github.com/lumi-devs/Lumi/blob/main/apps/dashboard/README.md) | *(not a `ServiceRole`)* | No | Lightweight HTTP app. Talks to `worker` over an internal HTTP RPC bridge. |

There is no separate gateway process, and no separate scheduler app package - the scheduler is
a deployment-level split (a second replica group of the same image/entrypoint), not a
code-level one. Each `worker`-role replica owns its own shard range end-to-end - gateway
connection, command dispatch, and module logic all live in the same process. `ServiceRole`
(`packages/core/src/lib/env.ts`) is a union of exactly `"worker" | "scheduler"`, read from the
`LUMI_ROLE` env var.

The entry point is intentionally thin. `apps/worker/src/main.ts`:

```ts
import "./telemetry.js";
import "@lumi/core/setup";
import { bootstrapClientApp, getServiceRole } from "@lumi/core";

const role = getServiceRole();
await bootstrapClientApp({ role });
```

Telemetry bootstrap is imported first (side-effect only) so instrumentation is installed before
any instrumented library loads.

## Inter-process communication

Two distinct transports exist, deliberately separate:

- **Worker ↔ Scheduler: Redis Streams**, via [`packages/event-bus`](https://github.com/lumi-devs/Lumi/blob/main/packages/event-bus/README.md). `RedisStreamsBus` is the sole transport implementation - one Redis Stream per event type, one consumer group per worker pool (default `lumi-workers`).
- **Dashboard ↔ Worker: internal HTTP RPC** (request/response), via `apps/dashboard/src/lib/rpc.ts` calling `packages/core/src/lib/rpc/http-server.ts`'s `POST /rpc` directly over the docker/cluster network - no message broker in between. This is a different mechanism from the event bus and is not used by worker/scheduler.

### Redis Streams bus mechanics

- Delivery via `XREADGROUP ... GROUP <group> <consumer> COUNT <batchSize> BLOCK <blockMs>` (defaults: batch 16, block 5000ms).
- At-least-once delivery. A background `XAUTOCLAIM` loop (every `claimIntervalMs`, default 30s) reclaims entries idle past `claimMinIdleMs` (default 60s) so a crashed consumer's in-flight messages get picked up by another.
- Poison messages: once `deliveryCount` exceeds `maxDeliveries` (default 5), the entry moves to `<stream>:dlq` and is ACKed off the live stream - it is never auto-replayed.
- Streams are bounded via `XADD ... MAXLEN ~ <defaultMaxLen>` (default 100,000).
- Stats (stream length, consumer lag) are polled periodically and exported as `lumi_stream_length` / `lumi_stream_consumer_lag` / `lumi_stream_dlq_length` Prometheus gauges.
- Explicit design contract: **exactly-once is out of scope** - the guarantee is at-least-once delivery plus idempotent handlers.

All tuning knobs are environment variables (`EVENT_STREAM_*`) - see [Configuration Reference](/Lumi/configuration/).

## Sharding & clustering

[`packages/sharding`](https://github.com/lumi-devs/Lumi/blob/main/packages/sharding/README.md) implements static shard-range scaling: each replica is told which shard IDs it owns via config, and there is no runtime coordination or rebalancing between processes.

- **Shard planning** (`shard-planner.ts`): calls Discord's `GET /gateway/bot` for the recommended shard count and session-start budget. `TOTAL_SHARDS=auto` (default) follows Discord's recommendation; a fixed integer pins it. `SHARD_LIST` restricts which shard IDs a given replica owns. Boot refuses to proceed if the remaining session-start budget can't cover the shards about to IDENTIFY, unless `SHARD_IDENTIFY_FORCE=true` - this exists so a crash-loop can't burn the daily IDENTIFY budget and get the bot rate-limited.
- **Shard telemetry** (`shard-telemetry.ts`): each replica publishes a TTL'd Redis row per shard it holds (status, ping, guild count) under `CLUSTER_NAME`'s namespace, purely for the dashboard's fleet view. There is no assignment blob, heartbeat set, or readiness flag behind it - a shard with no row is simply not running anywhere.
- Scaling replicas up or down, or changing which shard IDs a replica owns, means changing `SHARD_LIST`/`TOTAL_SHARDS` and restarting the affected processes - there is no in-place rebalance path. A change to the *total* shard count always requires a restart, since discord.js caches `shardCount` at `WebSocketManager` construction.

`CLUSTER_NAME` only turns on shard telemetry reporting (namespacing the Redis keys the dashboard reads for the fleet view); it does not turn on any coordination between replicas, and IDENTIFY throttling is always the single-process throttler. With a single replica and no `CLUSTER_NAME`, telemetry still reports under the `default` namespace.

## Database layer

**PostgreSQL** via Prisma (`prisma/schema.prisma`, 24 models) is the system of record. **All data access goes through `container.db`** (`DatabaseService`, `packages/core/src/lib/prisma/DatabaseService.ts`) - a facade over per-domain repositories (`global`, `config`, `modules`, `guildKV`, `access`, `permissions`, `downloader`, `audit`, `users`, `moderation`, `configHistory`, `configOverrides`, `afk`, `security`, `tempvc`, ...). Modules never touch `container.prisma` directly; see the [Module Creation Guide](/Lumi/guides/module-creation/#step-8-database--persistence) for the rule and why it exists.

**Redis** (`packages/core/src/lib/database/redis.ts`) is used for several distinct purposes, all namespaced under `lumi:*` in `RedisKeys`:

- Cache-aside reads for repositories (`getOrSet`), with matching TTLs in `RedisTTL`.
- Cross-process cache invalidation via `InvalidationBus` - a pub/sub channel (`lumi:cache:invalidate`) where deleting a key locally also broadcasts the deletion so every process's local cache stays coherent. Modules invalidate through `container.invalidation.invalidate(...)`, never a raw `redis.del` on a shared key.
- The event bus transport (Redis Streams, see above).
- Shard telemetry rows for the dashboard's fleet view (`packages/sharding`).
- The scheduler leader-election lock (`SCHEDULER_LEADER_LOCK`, see [Configuration Reference](/Lumi/configuration/)).
- BullMQ's job queue backing store.

## Dashboard Frontend

`apps/dashboard` is a Next.js (App Router) app; it is the one piece of the diagram above that changed shape in the v2 rewrite — the RPC sequence itself (`apps/dashboard` → internal HTTP RPC → `apps/worker` → Postgres/Redis → back) is unchanged, only the process that renders HTML did (and the transport, which moved off a message broker onto a direct HTTP call - see below). A pre-rewrite survey of Red-DiscordBot, YAGPDB, and Skyra shaped a few concrete choices:

- **The decoupled RPC bridge stays exactly as architected.** Red-DiscordBot's own `_rpc.py` — a JSON-RPC server the bot process exposes for an independent web frontend to call — validates the same design this monorepo already has: the dashboard never blocks or shares an event loop with the Discord gateway, regardless of which frontend framework renders its pages. `apps/dashboard/src/lib/rpc.ts` is a `server-only` module reachable only from Server Components, Route Handlers, and Server Actions — never bundled to the client.
- **Persistent nav rail + content-pane via layout route group.** YAGPDB's control panel splits a persistent per-guild nav (`cp_nav.html`) from a swappable content pane rebuilt on every request. Next's `app/guild/[guildId]/layout.tsx` renders the sidebar (`GuildSideNav`) once per navigation instead of on every page.
- **Config forms stay schema-driven off `ConfigField[]`** (`@lumi/contracts`), the same shape YAGPDB gets to by threading small "Discord-aware form control" template helpers (`roleOptions`, `channelOptions`, `hasPerm`) into every module's settings form — implemented here as shared client components keyed off `ConfigField.type`.
- **Auth is NextAuth.js (Auth.js v5)**, not the old hand-rolled HMAC-signed cookie + in-memory session Map — `apps/dashboard/src/lib/auth.ts`. The server-side IDOR guard (`authorizedGuild()` in `lib/auth-guards.ts`, re-checked on every guild-scoped render *and* every Server Action) and the Bot-Owner/Server-Owner route-level split are unchanged in spirit from the original design, just re-homed to App Router idioms (`notFound()`/`redirect()` instead of hand-written 403/302 responses).

Sentinel-based Redis HA is supported: setting `REDIS_SENTINELS` switches connection construction to Sentinel-aware options instead of a direct host/port.

## Command registration

Every `worker` replica registers its command set to Discord directly on boot - no coordination between replicas, regardless of `CLUSTER_NAME` or replica count. Discord's bulk-overwrite endpoint is idempotent, so concurrent replicas registering the same commands is a harmless no-op race, not a correctness concern.

## Observability

[`packages/observability`](https://github.com/lumi-devs/Lumi/blob/main/packages/observability/README.md) wires up tracing, metrics, and health probes identically across all apps via `bootstrapTelemetry()`, called before anything else loads.

- **Tracing**: OpenTelemetry, no-op unless `OTEL_ENABLED=true`. Ratio-based sampling (`OTEL_TRACES_SAMPLE_RATIO`), OTLP export over HTTP, best-effort auto-instrumentation of HTTP/Postgres/Redis clients (instrumentation failures never block boot).
- **Metrics**: Prometheus via `prom-client`, served at `GET /metrics` on `METRICS_PORT` (default 9090). Covers command RED metrics, event-bus throughput and lag, BullMQ failures, gateway shard latency/status, Discord REST 429s, Postgres pool utilization, and cache hit/miss rates.
- **Event-loop protection**: `startEventLoopMonitor()` uses Node's `perf_hooks.monitorEventLoopDelay` to report `lumi_event_loop_delay_seconds` (p50/p99/max) every 10s window. The `max` quantile is the one that matters for gateway health - a single multi-second stall drops heartbeats regardless of what the median looks like.
- **Health endpoints**: `GET /healthz` (liveness - always 200 once serving) and `GET /readyz` (readiness - runs every registered probe with a 2s timeout each). Infrastructure probes (`postgres`, `redis`) run on every role; `worker` additionally checks gateway readiness, and whichever replica holds the scheduler leader lock checks it can still see BullMQ. `markDraining()` flips `/readyz` to 503 immediately on SIGTERM, before in-flight work finishes closing, so orchestrators pull the replica out of rotation early.

## Deployment topology

See [Configuration Reference](/Lumi/configuration/) for the full environment variable list, Docker Compose services, and Kubernetes manifests. In short: `worker` is deployed as a Kubernetes `StatefulSet` (shard identity matters), `scheduler` as a `Deployment` with `strategy: Recreate` (one scheduler replica at a time; workers own a BullMQ worker too, and the queue itself hands each job to exactly one of them), and an optional `nirn-proxy` deployment shares Discord REST rate limits across worker replicas once you scale past one.

