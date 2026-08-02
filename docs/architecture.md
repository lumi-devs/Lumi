# Architecture & System Topology

## Process roles

Lumi runs as three independent apps under `apps/`:

| App | Role | Discord gateway? | Purpose |
| :--- | :--- | :--- | :--- |
| [`apps/worker`](../apps/worker/README.md) | `worker` | Yes | Owns the Discord WebSocket connection(s) and runs every command, module, and interaction handler in-process. |
| [`apps/scheduler`](../apps/scheduler/README.md) | `scheduler` | No | Owns BullMQ delayed/cron job queues. Never opens a gateway connection. |
| [`apps/dashboard`](../apps/dashboard/README.md) | *(not a `ServiceRole`)* | No | Lightweight HTTP app. Talks to `worker` over RabbitMQ RPC. |

There is no separate gateway process. Each `worker` replica owns its own shard range end-to-end - gateway connection, command dispatch, and module logic all live in the same process. `ServiceRole` (`packages/core/src/lib/env.ts`) is a union of exactly `"worker" | "scheduler"`.

Entry points are intentionally thin. `apps/worker/src/main.ts`:

```ts
import "./telemetry.js";
import "@lumi/core/setup";
import { bootstrapClientApp } from "@lumi/core";

await bootstrapClientApp({ role: "worker" });
```

`apps/scheduler/src/main.ts` is structurally identical, passing `role: "scheduler"`. Telemetry bootstrap is imported first (side-effect only) so instrumentation is installed before any instrumented library loads.

## Inter-process communication

Two distinct transports exist, deliberately separate:

- **Worker ↔ Scheduler: Redis Streams**, via [`packages/event-bus`](../packages/event-bus/README.md). `RedisStreamsBus` is the sole transport implementation - one Redis Stream per event type, one consumer group per worker pool (default `lumi-workers`).
- **Dashboard ↔ Worker: RabbitMQ RPC** (request/response), via `apps/dashboard/src/rpc.ts`. Uses RabbitMQ's `amq.rabbitmq.reply-to` pseudo-queue against a shared request queue (`lumi.rpc.requests`). This is a different mechanism from the event bus and is not used by worker/scheduler.

### Redis Streams bus mechanics

- Delivery via `XREADGROUP ... GROUP <group> <consumer> COUNT <batchSize> BLOCK <blockMs>` (defaults: batch 16, block 5000ms).
- At-least-once delivery. A background `XAUTOCLAIM` loop (every `claimIntervalMs`, default 30s) reclaims entries idle past `claimMinIdleMs` (default 60s) so a crashed consumer's in-flight messages get picked up by another.
- Poison messages: once `deliveryCount` exceeds `maxDeliveries` (default 5), the entry moves to `<stream>:dlq` and is ACKed off the live stream - it is never auto-replayed.
- Streams are bounded via `XADD ... MAXLEN ~ <defaultMaxLen>` (default 100,000).
- Stats (stream length, consumer lag) are polled periodically and exported as `lumi_stream_length` / `lumi_stream_consumer_lag` / `lumi_stream_dlq_length` Prometheus gauges.
- Explicit design contract: **exactly-once is out of scope** - the guarantee is at-least-once delivery plus idempotent handlers.

All tuning knobs are environment variables (`EVENT_STREAM_*`) - see [Configuration Reference](configuration.md).

## Sharding & clustering

[`packages/sharding`](../packages/sharding/README.md) implements horizontal shard-range scaling without a separate control-plane service - coordination state lives entirely in Redis.

- **Shard planning** (`shard-planner.ts`): calls Discord's `GET /gateway/bot` for the recommended shard count and session-start budget. `TOTAL_SHARDS=auto` (default) follows Discord's recommendation; a fixed integer pins it. `SHARD_LIST` restricts which shard IDs a given replica owns. Boot refuses to proceed if the remaining session-start budget can't cover the shards about to IDENTIFY, unless `SHARD_IDENTIFY_FORCE=true` - this exists so a crash-loop can't burn the daily IDENTIFY budget and get the bot rate-limited.
- **Cluster coordination** (`coordinator.ts`): replicas heartbeat into a Redis ZSET every `heartbeatIntervalMs` (default 5s); entries older than `memberTtlMs` (default 15s) are pruned as dead. Whichever replica holds a short-lived Redis lock (`SET NX PX`) is the assignment leader - it divides shard IDs contiguously and evenly across the live replica set and publishes the new assignment over a Redis pub/sub channel.
- **In-place rebalancing** (`dynamic-strategy.ts`): a replica can add/remove individual shards when membership changes, without a full process restart. A change to the *total* shard count still requires a restart, since discord.js caches `shardCount` at `WebSocketManager` construction.
- **Session continuity** (`session-store.ts`): per-shard WebSocket session state is persisted in Redis so a shard moving to a new replica (rebalance, or pod replacement) can RESUME instead of spending a fresh IDENTIFY.

Clustering only activates when `CLUSTER_NAME` is set. With a single replica and no `CLUSTER_NAME`, all of the above is inert and the process runs the plain `SHARD_LIST` + local IDENTIFY throttle path.

## Database layer

**PostgreSQL** via Prisma (`prisma/schema.prisma`, 23 models) is the system of record. **All data access goes through `container.db`** (`DatabaseService`, `packages/core/src/lib/prisma/DatabaseService.ts`) - a facade over per-domain repositories (`global`, `config`, `modules`, `guildKV`, `access`, `permissions`, `downloader`, `audit`, `users`, `moderation`, `configHistory`, `configOverrides`, `afk`, `security`, `tempvc`, ...). Modules never touch `container.prisma` directly; see the [Module Creation Guide](GUIDE_MODULE_CREATION.md#database--persistence) for the rule and why it exists.

**Redis** (`packages/core/src/lib/database/redis.ts`) is used for several distinct purposes, all namespaced under `lumi:*` in `RedisKeys`:

- Cache-aside reads for repositories (`getOrSet`), with matching TTLs in `RedisTTL`.
- Cross-process cache invalidation via `InvalidationBus` - a pub/sub channel (`lumi:cache:invalidate`) where deleting a key locally also broadcasts the deletion so every process's local cache stays coherent. Modules invalidate through `container.invalidation.invalidate(...)`, never a raw `redis.del` on a shared key.
- The event bus transport (Redis Streams, see above).
- Cluster/shard coordination state (`packages/sharding`).
- Leader-election locks (command registration, scheduler leader - see below).
- BullMQ's job queue backing store.

## Dashboard Frontend

`apps/dashboard` is a Next.js (App Router) app; it is the one piece of the diagram above that changed shape in the v2 rewrite — the RPC sequence itself (`apps/dashboard` → RabbitMQ → `apps/worker` → Postgres/Redis → back) is unchanged, only the process that renders HTML did. A pre-rewrite survey of Red-DiscordBot, YAGPDB, and Skyra (see `dashboard.md` for the full spec this rewrite implements) shaped a few concrete choices:

- **The decoupled RPC bridge stays exactly as architected.** Red-DiscordBot's own `_rpc.py` — a JSON-RPC server the bot process exposes for an independent web frontend to call — validates the same design this monorepo already has: the dashboard never blocks or shares an event loop with the Discord gateway, regardless of which frontend framework renders its pages. `apps/dashboard/src/lib/rpc.ts` is a `server-only` module reachable only from Server Components, Route Handlers, and Server Actions — never bundled to the client.
- **Sidebar + content-pane is a layout route group, not a re-rendered shell.** YAGPDB's control panel splits a persistent per-guild nav (`cp_nav.html`) from a swappable content pane rebuilt on every request. Next's `app/guild/[guildId]/layout.tsx` renders that sidebar once per navigation instead of on every page.
- **Config forms stay schema-driven off `ConfigField[]`** (`@lumi/contracts`), the same shape YAGPDB gets to by threading small "Discord-aware form control" template helpers (`roleOptions`, `channelOptions`, `hasPerm`) into every module's settings form — implemented here as shared client components keyed off `ConfigField.type`.
- **Auth is NextAuth.js (Auth.js v5)**, not the old hand-rolled HMAC-signed cookie + in-memory session Map — `apps/dashboard/src/lib/auth.ts`. The server-side IDOR guard (`authorizedGuild()` in `lib/auth-guards.ts`, re-checked on every guild-scoped render *and* every Server Action) and the Bot-Owner/Server-Owner route-level split are unchanged in spirit from the original design, just re-homed to App Router idioms (`notFound()`/`redirect()` instead of hand-written 403/302 responses).

Sentinel-based Redis HA is supported: setting `REDIS_SENTINELS` switches connection construction to Sentinel-aware options instead of a direct host/port.

## Command registration leader election

When `worker` runs as multiple replicas under a `CLUSTER_NAME`, every replica loading its command stores would otherwise all try to push the same application commands to Discord on boot - redundant and wasteful of Discord's registration rate limit. `CommandRegistrationLeaderElection` (`packages/core/src/lib/client/CommandRegistrationLeaderElection.ts`) elects exactly one replica to actually register commands:

1. No-op for the `scheduler` role, or when there's no cluster - a lone process always registers.
2. Otherwise, replicas contend for a renewing Redis lock (`lumi:commands:registration:leader`, default TTL 30s, renewed every 10s).
3. The winner holds the lock for its process lifetime; losers still load and dispatch their command pieces locally by name, but never call Discord's registration routes (`suppressCommandRegistration`).
4. **Fails open**: if Redis is unreachable during acquisition, the replica registers unguarded - starting with possibly-stale commands beats starting with none.

## Observability

[`packages/observability`](../packages/observability/README.md) wires up tracing, metrics, and health probes identically across all apps via `bootstrapTelemetry()`, called before anything else loads.

- **Tracing**: OpenTelemetry, no-op unless `OTEL_ENABLED=true`. Ratio-based sampling (`OTEL_TRACES_SAMPLE_RATIO`), OTLP export over HTTP, best-effort auto-instrumentation of HTTP/Postgres/Redis/AMQP clients (instrumentation failures never block boot).
- **Metrics**: Prometheus via `prom-client`, served at `GET /metrics` on `METRICS_PORT` (default 9090). Covers command RED metrics, event-bus throughput and lag, BullMQ failures, gateway shard latency/status, Discord REST 429s, Postgres pool utilization, and cache hit/miss rates.
- **Event-loop protection**: `startEventLoopMonitor()` uses Node's `perf_hooks.monitorEventLoopDelay` to report `lumi_event_loop_delay_seconds` (p50/p99/max) every 10s window. The `max` quantile is the one that matters for gateway health - a single multi-second stall drops heartbeats regardless of what the median looks like.
- **Health endpoints**: `GET /healthz` (liveness - always 200 once serving) and `GET /readyz` (readiness - runs every registered probe with a 2s timeout each). Infrastructure probes (`postgres`, `redis`, `rabbitmq`) run on every role; `worker` additionally checks gateway readiness, and whichever replica holds the scheduler leader lock checks it can still see BullMQ. `markDraining()` flips `/readyz` to 503 immediately on SIGTERM, before in-flight work finishes closing, so orchestrators pull the replica out of rotation early.

## Deployment topology

See [Configuration Reference](configuration.md) for the full environment variable list, Docker Compose services, and Kubernetes manifests. In short: `worker` is deployed as a Kubernetes `StatefulSet` (shard identity matters), `scheduler` as a `Deployment` with `strategy: Recreate` (exactly one BullMQ owner at a time), and an optional `nirn-proxy` deployment shares Discord REST rate limits across worker replicas once you scale past one.
