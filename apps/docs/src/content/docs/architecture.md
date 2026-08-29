---
title: "Architecture & System Topology"
description: "Process roles, the Redis Streams event bus, sharding/clustering, the database layer, command registration, and observability."
---

## Process model

Lumi runs as two independent apps under `apps/`:

| App | Discord gateway? | Purpose |
| :--- | :--- | :--- |
| [`apps/worker`](https://github.com/lumi-devs/Lumi/blob/main/apps/worker/README.md) | Yes | Owns the Discord WebSocket connection(s) and runs every command, module, and interaction handler in-process. |
| [`apps/dashboard`](https://github.com/lumi-devs/Lumi/blob/main/apps/dashboard/README.md) | No | Lightweight HTTP app. Talks to `worker` over an internal HTTP RPC bridge. |

There is no separate scheduler process and no service-role distinction - every worker process is
identical, holding a real gateway shard connection and running every command, module, and
listener. `apps/worker/src/main.ts` is a lightweight *manager* process: it constructs a
discord.js `ShardingManager` and spawns one child OS process per shard
(`apps/worker/src/shard-client.ts`), which is where the actual `LumiClient` lives. The manager
itself opens no gateway connection, binds no HTTP port, and loads no telemetry - there's nothing
in it to instrument.

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

Telemetry bootstrap is imported first in `shard-client.ts` (side-effect only) so instrumentation
is installed before any instrumented library loads.

### Primary shard

Singleton duties - things exactly one process per pod should do - are gated by
`isPrimaryShard()` (`packages/core/src/lib/env.ts`) rather than a role or a Redis lock: it
returns true if this process either isn't running under `ShardingManager` at all, or holds shard
id 0. Shard 0 is always globally unique across the whole fleet, so this is a free,
zero-coordination leader election - no lock to acquire, nothing to fail over. The primary shard
is the only process that:

- Binds the internal RPC HTTP server (`RPC_HTTP_PORT`) the dashboard talks to.
- Binds the Prometheus `/metrics` HTTP listener.
- Loads `@sapphire/plugin-scheduled-tasks` - i.e. owns BullMQ cron/delayed job *scheduling*.
- Aggregates the `/readyz` `discord` probe across every shard in the pod (see Observability).

Every process, primary or not, still *executes* fired task effects through the event-bus relay
(`TaskFireConsumer`) below - that has to happen wherever the relevant guild's shard actually
lives, which is unrelated to which shard owns BullMQ itself.

## Inter-process communication

Two distinct transports exist, deliberately separate:

- **Task scheduling → task execution: Redis Streams**, via [`packages/event-bus`](https://github.com/lumi-devs/Lumi/blob/main/packages/event-bus/README.md). `RedisStreamsBus` is the sole transport implementation - one Redis Stream per event type, one consumer group per worker pool (default `lumi-workers`). The primary shard's BullMQ job fires onto the bus; every shard consumes and executes the effect for the guilds it holds.
- **Dashboard ↔ Worker: internal HTTP RPC** (request/response), via `apps/dashboard/src/lib/rpc.ts` calling `packages/core/src/lib/rpc/http-server.ts`'s `POST /rpc` directly over the docker/cluster network - no message broker in between. This is a different mechanism from the event bus and is not used for shard-to-shard communication.

### Redis Streams bus mechanics

- Delivery via `XREADGROUP ... GROUP <group> <consumer> COUNT <batchSize> BLOCK <blockMs>` (defaults: batch 16, block 5000ms).
- At-least-once delivery. A background `XAUTOCLAIM` loop (every `claimIntervalMs`, default 30s) reclaims entries idle past `claimMinIdleMs` (default 60s) so a crashed consumer's in-flight messages get picked up by another.
- Poison messages: once `deliveryCount` exceeds `maxDeliveries` (default 5), the entry moves to `<stream>:dlq` and is ACKed off the live stream - it is never auto-replayed.
- Streams are bounded via `XADD ... MAXLEN ~ <defaultMaxLen>` (default 100,000).
- Stats (stream length, consumer lag) are polled periodically and exported as `lumi_stream_length` / `lumi_stream_consumer_lag` / `lumi_stream_dlq_length` Prometheus gauges.
- Explicit design contract: **exactly-once is out of scope** - the guarantee is at-least-once delivery plus idempotent handlers.

All tuning knobs are environment variables (`EVENT_STREAM_*`) - see [Configuration Reference](/Lumi/configuration/).

## Sharding & clustering

[`packages/sharding`](https://github.com/lumi-devs/Lumi/blob/main/packages/sharding/README.md) now holds only cross-process shard
*telemetry* - actual shard assignment is discord.js's `ShardingManager`, not a custom planner.

- **Shard spawning**: `apps/worker/src/main.ts` constructs a `ShardingManager` pointed at `shard-client.ts` and calls `spawn()`. `TOTAL_SHARDS=auto` (default) follows Discord's recommended count; a fixed integer pins it. `SHARD_LIST` restricts which shard IDs this replica's manager spawns children for - unchanged operator-facing behavior from the old planner, just passed straight through to `ShardingManager`'s `totalShards`/`shardList` options instead of a hand-rolled `/gateway/bot` call.
- **Shard telemetry** (`shard-telemetry.ts`): each shard child publishes a TTL'd Redis row (status, ping, guild count) under `CLUSTER_NAME`'s namespace. Used both for the dashboard's fleet view and for the primary shard's `/readyz` probe, which also confirms every sibling shard in the pod reports ready before answering healthy. There is no assignment blob or heartbeat set behind it beyond these rows - a shard with no row is simply not running anywhere.
- Scaling replicas up or down, or changing which shard IDs a replica owns, means changing `SHARD_LIST`/`TOTAL_SHARDS` and restarting the affected processes - there is no in-place rebalance path. `ShardingManager`'s `respawn: true` restarts an individual crashed shard child in place; it does not rebalance shard *assignment*.

`CLUSTER_NAME` only turns on shard telemetry reporting (namespacing the Redis keys the dashboard reads for the fleet view); it does not turn on any coordination between replicas. With a single replica and no `CLUSTER_NAME`, telemetry still reports under the `default` namespace.

## Database layer

**PostgreSQL** via Prisma (`prisma/schema.prisma`, 27 models) is the system of record. **All data access goes through `container.db`** (`DatabaseService`, `packages/core/src/lib/prisma/DatabaseService.ts`) - a facade over per-domain repositories (`global`, `config`, `modules`, `guildKV`, `access`, `permissions`, `downloader`, `audit`, `users`, `moderation`, `configHistory`, `configOverrides`, `afk`, `security`, `tempvc`, ...). Modules never touch `container.prisma` directly; see the [Module Creation Guide](/Lumi/guides/module-creation/#step-8-database--persistence) for the rule and why it exists.

**Redis** (`packages/core/src/lib/database/redis.ts`) is used for several distinct purposes, all namespaced under `lumi:*` in `RedisKeys`:

- Cache-aside reads for repositories (`getOrSet`), with matching TTLs in `RedisTTL`.
- Cross-process cache invalidation via `InvalidationBus` - a pub/sub channel (`lumi:cache:invalidate`) where deleting a key locally also broadcasts the deletion so every process's local cache stays coherent. Modules invalidate through `container.invalidation.invalidate(...)`, never a raw `redis.del` on a shared key.
- The event bus transport (Redis Streams, see above).
- Shard telemetry rows for the dashboard's fleet view (`packages/sharding`).
- BullMQ's job queue backing store.

## Dashboard Frontend

`apps/dashboard` is a Next.js (App Router) app; it is the one piece of the diagram above that changed shape in the v2 rewrite — the RPC sequence itself (`apps/dashboard` → internal HTTP RPC → `apps/worker` → Postgres/Redis → back) is unchanged, only the process that renders HTML did (and the transport, which moved off a message broker onto a direct HTTP call - see below). Key architectural choices:

- **The decoupled RPC bridge stays isolated.** The dashboard never blocks or shares an event loop with the Discord gateway, ensuring web traffic cannot degrade bot responsiveness. `apps/dashboard/src/lib/rpc.ts` is a `server-only` module reachable only from Server Components, Route Handlers, and Server Actions — never bundled to the client.
- **Persistent nav rail + content-pane via layout route group.** The admin interface splits a persistent per-guild nav from a swappable content pane. Next's `app/guild/[guildId]/layout.tsx` renders the sidebar (`GuildSideNav`) once per navigation instead of on every page.
- **Config forms stay schema-driven off `ConfigField[]`** (`@lumi/contracts`), allowing dynamic, Discord-aware form controls (`roleOptions`, `channelOptions`, `hasPerm`) in every module's settings form — implemented as shared client components keyed off `ConfigField.type`.
- **Auth is NextAuth.js (Auth.js v5)**, utilizing standard OAuth2 flows and signed JWT sessions — `apps/dashboard/src/lib/auth.ts`. The server-side IDOR guard (`authorizedGuild()` in `lib/auth-guards.ts`, re-checked on every guild-scoped render *and* every Server Action) and the Bot-Owner/Server-Owner route-level split use App Router idioms (`notFound()`/`redirect()`).

Sentinel-based Redis HA is supported: setting `REDIS_SENTINELS` switches connection construction to Sentinel-aware options instead of a direct host/port.

## Command registration

Every shard child registers its command set to Discord directly on boot - no coordination between processes, regardless of `CLUSTER_NAME` or replica count. Discord's bulk-overwrite endpoint is idempotent, so concurrent processes registering the same commands is a harmless no-op race, not a correctness concern.

## Observability

[`packages/observability`](https://github.com/lumi-devs/Lumi/blob/main/packages/observability/README.md) wires up tracing, metrics, and health probes identically across all apps via `bootstrapTelemetry()`, called before anything else loads.

- **Tracing**: OpenTelemetry, no-op unless `OTEL_ENABLED=true`. Ratio-based sampling (`OTEL_TRACES_SAMPLE_RATIO`), OTLP export over HTTP, best-effort auto-instrumentation of HTTP/Postgres/Redis clients (instrumentation failures never block boot).
- **Metrics**: Prometheus via `prom-client`, served at `GET /metrics` on `METRICS_PORT` (default 9090). Covers command RED metrics, event-bus throughput and lag, BullMQ failures, gateway shard latency/status, Discord REST 429s, Postgres pool utilization, and cache hit/miss rates.
- **Event-loop protection**: `startEventLoopMonitor()` uses Node's `perf_hooks.monitorEventLoopDelay` to report `lumi_event_loop_delay_seconds` (p50/p99/max) every 10s window. The `max` quantile is the one that matters for gateway health - a single multi-second stall drops heartbeats regardless of what the median looks like.
- **Health endpoints**: `GET /healthz` (liveness - always 200 once serving) and `GET /readyz` (readiness - runs every registered probe with a 2s timeout each), bound only by the primary shard (see Primary shard, above) - non-primary shards don't serve HTTP at all. Infrastructure probes (`postgres`, `redis`) and the `discord` gateway-readiness probe always run; the primary additionally aggregates `discord` readiness across every sibling shard in the pod via shard telemetry, and runs a `scheduler-tasks` probe confirming it can still see BullMQ. `markDraining()` flips `/readyz` to 503 immediately on SIGTERM, before in-flight work finishes closing, so orchestrators pull the pod out of rotation early.

## Deployment topology

See [Configuration Reference](/Lumi/configuration/) for the full environment variable list, Docker Compose services, and Kubernetes manifests. In short: `worker` is deployed as a Kubernetes `StatefulSet` (shard identity matters), each pod running a `ShardingManager` that spawns one child process per shard it owns; the primary shard (holding shard 0) is the sole BullMQ owner and binds internal RPC and metrics. `dashboard` is deployed as a Kubernetes `Deployment` (stateless web tier) talking to `worker-0` over internal RPC. Multi-arch container images (`ghcr.io/lumi-devs/worker`, `ghcr.io/lumi-devs/dashboard`) are built and published for amd64 and arm64. An optional `nirn-proxy` deployment shares Discord REST rate limits across worker replicas once you scale past one.

