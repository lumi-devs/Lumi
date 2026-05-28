# Ember-TS — Architecture & Scale Roadmap

> Two-part plan. **Part I (Foundation)** cleans the code architecture so it *can* be
> distributed. **Part II (Scale-out)** turns Ember into a Wick/Dyno-class, horizontally
> scalable, multi-host bot — while still running on a laptop via one `docker-compose up`.
>
> Foundation is ordered risk-ascending. Scale-out is ordered by dependency (each phase
> needs the previous). **Part II depends on Part I** — notably the monorepo (F6) and the
> DatabaseService split (F4) are *prerequisites*, not polish, once we go multi-service.

**Legend:** `[ ]` todo · `[~]` in progress · `[x]` done · `⚠` breaking · `🔬` needs verify · `🔗` cross-service

---

## Decisions captured (from scoping)

**Foundation:**
- Scope: all 6 items, full greenfield. Order: risk-ascending.
- Dead RabbitMQ **job-queue** (`registerJobHandler`/`enqueueJob`): **DELETE.** Verified against
  `../Ember-staging/cogs` — no music/AI/economy/leveling/image-gen; the doc's "prime candidate"
  `mydata` export is a 74-line synchronous `json.dumps` (`Ember-staging/cogs/utility/mydata/cog.py:29`).
- RabbitMQ **RPC**: **KEEP** (dashboard consumes it).

**Scale target & topology (this revision):**
- **Target:** Wick/Dyno scale — 1M+ guilds, multi-host. **Single-instance preserved** via
  docker-compose running the full stack on one box (every service, replicas=1).
- **Priorities (all):** Uptime/HA · Horizontal scale · Cost/efficiency · Observability.
- **Topology (recommended):** **split services** — `gateway`, `worker`, `scheduler`, `api`
  behind shared Postgres/Redis/transport. Monolith only as the degenerate single-host case.
- **Event transport (recommended):** **Redis Streams** now (consumer groups = at-least-once +
  horizontal workers + backpressure; we already run Redis) → documented **cutover to NATS JetStream**
  when gateway event throughput outgrows a single Redis. **Kafka** noted but not recommended (ops
  burden; only if event-sourcing/replay becomes a requirement). **RabbitMQ stays for RPC only.**
- **Gateway (recommended):** **discord.js ShardingManager + clusters** now → **cutover to a dedicated
  gateway proxy** (Twilight-gateway / nirn-proxy style) + a shared **REST/rate-limit proxy** at the
  multi-host point, so workers become stateless and don't each hold a WS connection or risk global 429s.
- **Reference patterns:** Skyra = Postgres-table scheduler + in-proc timer (`../skyra/src/lib/schedule`);
  Red = `@tasks.loop` poller + Config(JSON/PG), no broker. Both prove "DB is source of truth, re-arm on
  boot." We keep BullMQ (heavier but already working) and steal Skyra's **`catchUp`** semantics.

---

## Target architecture (end state)

```
                    ┌─────────────────────────────────────────────┐
 Discord  ───WS──▶  │ GATEWAY service (sharded)                    │
                    │  proxy: maintain WS, decode events, publish  │
                    └───────────────┬─────────────────────────────┘
                                    │ raw events  ──▶ EVENT BUS (Redis Streams → NATS)
                                    ▼
                    ┌─────────────────────────────────────────────┐
                    │ WORKER service (stateless, N replicas)       │
                    │  consume events/interactions, run modules,   │
                    │  call Discord REST via REST PROXY            │
                    └───┬───────────────┬─────────────────┬────────┘
                        │               │                 │
              SCHEDULER (BullMQ)   POSTGRES (truth)   REDIS (cache/state)
                        │
                    fires due jobs ──▶ EVENT BUS ──▶ workers
                                    ▲
                    ┌───────────────┴─────────────────────────────┐
                    │ API service: dashboard RPC (RabbitMQ)        │
                    └─────────────────────────────────────────────┘

   REST PROXY (shared)  ── coordinates global Discord rate limits for ALL workers
   Single-instance      ── docker-compose brings every box above up on one host
```

**Service responsibilities:**
- **gateway** — only Discord WS + event decode + publish. No business logic. Survives worker restarts.
- **worker** — stateless; modules/commands/listeners execute here. Scales horizontally on queue depth.
- **scheduler** — owns BullMQ; durable/time-based jobs; re-arms outstanding jobs on boot; `catchUp` policy.
- **api** — dashboard RPC over RabbitMQ; gated by `isDashboardEnabled`.
- **rest-proxy** — single outbound choke point for Discord REST so 1000s of workers share one rate-limit budget.

---

# PART I — Foundation (must precede scale-out)

## Phase F0 — Fix the live regression ⚠ (do first)

Dead-code pass removed `registerServices()` + pass-through `onLoad/onUnload` from
`src/core/module-system/Module.ts`; addons still override them → won't compile.

- [x] `../ember-addons/rolementions/index.ts`: drop `override registerServices() {}`; remove the
      imperative `onLoad()` `registerPath(...)` calls (`ModuleStore.loadModule` already scans sub-stores).
- [x] Sweep `../ember-addons/emoji-stealer/` for the same dead overrides.
- [x] 🔬 `bun run typecheck` clean (main repo; addons resolve `#core/*` only when downloaded in-tree, no standalone build).

## Phase F1 — i18n: commit or cut (§6, low risk)

One file (`src/languages/en-US/system.json`) but `plugin-i18next` loaded + ~7 call sites; strings hardcoded
(`src/modules/filter/listeners/messageCreate.ts:38`).
- [x] **DECISION** path A (full) or B (rip out). Default: **B** until a 2nd locale is real. → **Chose B.**
- [x] B: removed plugin register from `src/client/setup.ts` + `i18n` block from `EmberClient.ts`, inlined all call sites (`makeListCard` no longer takes `t`; afk/mentions, tempvc, permissions×2, repo×2), deleted `src/languages/`, dropped `@sapphire/plugin-i18next` + `i18next` + `i18next-fs-backend`.
- [~] A (defer): per-module `languages/`, every card via `resolveKey`, mirror `../skyra/src/languages/`. — not chosen.

## Phase F2 — Collapse job systems (§4, low risk, deletion)

- [x] Deleted fire-and-forget Rabbit queue (`EmberJobs`/`registerJobHandler`/`enqueueJob`/`handleJob` + `ember.jobs*` exchanges/queues + DLX) from `src/core/rabbitmq/index.ts`. `#setup` now asserts only `ember.events` + `ember.rpc.requests` + reply-to; `startConsumers` only consumes RPC.
- [x] Removed the `cpuBound` branch (it lived inside `handleJob`, now gone). `JOB_TIMEOUT_MS` moved to `WorkerManager.ts` (its only consumer); `FilterService` calls `WorkerManager` directly.
- [x] Kept `registerRpcHandler` + `isDashboardEnabled` (dashboard RPC untouched).
- [x] Adopted Skyra's **`catchUp`** semantics: new `src/core/lib/scheduled-tasks.ts` (`CatchUpMeta` + `shouldRunNow`). All 3 typed payloads extend `CatchUpMeta` and guard at top of `run`. afk-delete-message opts out (`catchUp:false` + `scheduledFor`) to avoid stale-delete herds; mod-lift & tempvc-cleanup keep default `catchUp:true` (must run).
- [x] Trimmed `ARCHITECTURE_TIERS.md` Rabbit section to reality + moved aspirational modules to a "Future" block. Also fixed `CLAUDE.md`, `README.md`, `docs/reference/messaging.md`, and repointed ping monitoring (`ember.jobs.active` → `ember.rpc.requests`).

## Phase F3 — Zod-first config (§3, medium risk)

`ModuleMeta` declares config twice (`configFields` + `configSchema`); STRING "split-the-comma-yourself".
- [x] One Zod schema per module = source of truth. New `src/core/module-system/config-schema.ts` holds the `cfg.*` field builders (`boolean/number/string/enum/channel/role/user`), each returning a Zod type tagged (via a `WeakMap`) with the UI metadata the panel needs. Modules author only `configSchema: cfg.object({...})`.
- [x] Derive `/config` UI from schema. `fieldsFromSchema()` produces the flat `ConfigField[]` the panel + dashboard RPC consume; the `EmberModule` decorator (and `Module` ctor) populate `meta.configFields` from `configSchema` so `config-panel.ts`/`interaction-handlers/config-panel.ts` are unchanged. `ConfigService.setConfig` now coerces then validates the coerced value against the schema. `configFields` is no longer hand-authored anywhere (only the derived output remains, sent to the web dashboard).
- [x] Define comma→`string[]` transform once: `parseConfigList()` in `config-schema.ts`. STRING fields flagged `list: true` are stored verbatim and read as `string[]` via `ConfigService.getConfigList`. Removed ad-hoc splits in `FilterService.loadGuild` and `thread_cleaner/listeners/threadCreate.ts`. (rolementions had no list field — its number/channel/bool fields were migrated to `cfg.*`.)
- [x] Migrated every module + addon: afk, mod, verify, filter, user_media, thread_cleaner, and the rolementions addon. Writes validate against the schema; `bun run typecheck` clean.

## Phase F4 — Split DatabaseService into repositories (§2, medium-high) 🔗 *scale prereq*

`src/prisma/DatabaseService.ts` = 1067-line god object. At scale, stateless workers hammer this — it must be poolable and per-domain. Ref: `../skyra/src/lib/database/{settings,utils}`.
- [x] Carve per-domain repos under `src/prisma/repositories/`: `config`, `modules`, `guildKV`, `access`, `permissions`, `downloader`, `audit`, `users`, `moderation`, `configHistory`, `configOverrides`. Each extends the shared `Repository` base (owns `prisma`/`redis`/`logger` + `getOrSet` + `invalidate`) and owns its tables + Redis keys/TTLs. Cross-domain reads go through `this.db.<repo>` (e.g. `ModuleRepository` reads the `enabled` config key via `this.db.config`).
- [x] `container.db` (`DatabaseService`) is now a thin facade: constructs the repos, exposes them as `db.<repo>`, and keeps only the genuinely cross-domain ops (`deleteUserData`, `transaction`, `publishBotStats`). All 112 call sites + the rolementions addon migrated to `db.<repo>.<method>`. `getOrSet`/`InvalidationBus` preserved on the base class. Typecheck clean; tests unchanged (6 pre-existing discord.js-polyfill failures, no regression).
- [x] **Pool for many workers:** front Postgres with **PgBouncer** (transaction pooling) in `docker-compose.yml` (`edoburu/pgbouncer`, `POOL_MODE=transaction`, `DEFAULT_POOL_SIZE=20`, `MAX_CLIENT_CONN=1000`, scram auth). Runtime `POSTGRES_URL` now points at `pgbouncer:6432`; migrations use a new `DIRECT_POSTGRES_URL` (DDL/advisory locks can't run through a transaction-pooled proxy) wired through `prisma.config.ts`. Capped the pg pool per-process via `POSTGRES_POOL_MAX` (default 10) in `src/database/client.ts`. `.env.example` documents both new vars.
- [x] 🔬 No module imports `container.prisma` directly — **done.** Added module-table repos `AfkRepository` (afkEntry) + `ThreadRepository` (trackedThread) and generic KV bulk methods on `GuildKVRepository` (`listModuleData`/`deleteModuleData`/`deleteModuleDataMany`); added `ModerationRepository.updateCaseReason`/`anonymizeUser`. Migrated every call site: afk, thread_cleaner, tempvc (index/data/registry), mod (index/cases), and the rolementions addon (now via `db.guildKV`). Addon `CONTRIBUTING.md` repointed off `container.prisma`. `grep` for `container.prisma` in modules/addons is empty; typecheck clean; tests unchanged (pre-existing discord.js-polyfill failures only).

## Phase F5 — Declarative module contract (§1, high risk, keystone) 🔗 *scale prereq* — DONE

Discovery `import()`s every `index.ts` to read `meta`; addons imperatively `registerPath`. At scale we must answer "which **service** loads which module?" (workers run modules; gateway doesn't).
- [x] Static `manifest.json` per module: new `src/core/module-system/manifest.ts` (`ModuleManifest` = name, displayName, emoji, description, version, isCore, dependencies, conflicts, configOverrides, **targetService**, declared **subStores**, derived **configFields**). Generated by `scripts/generate-manifests.ts` (`bun run modules:manifest`) which imports each module's in-code `meta` (Zod `configSchema` stays the single source of truth) and serialises it. 11 manifests committed (afk, dashboard, utility + nick/purge/tempvc/thread_cleaner/user_media, mod, filter, verify).
- [x] Rewrote `discover()` (`ModuleStore.ts`) to read `manifest.json` directly — **no code execution at discovery**. Builds `ModuleRecord` (incl. `targetService`) from the manifest; only falls back to the legacy `import()` ingest for manifest-less dirs (addons). Kills the discord.js-in-worker import-crash class at discovery. Zod schema resolved lazily via new `ModuleStore.getConfigSchema()` (cached); `ConfigService.setConfig` now `await`s it for write validation.
- [~] Lazy-load after enabled: discovery no longer imports module code, and `loadModule` mounts sub-stores by convention; **boot still uses `registerPath` + `super.loadAll()`** rather than a pure convention-mount (deferred — not yet unified). No module calls `registerPath` (only the store does).
- [x] 🔬 enable/disable + cluster `InvalidationBus` reload still works; addons hot-load. `bun run typecheck` clean. ⚠ Runtime suite **not executed** — `node_modules/discord.js/src/index.js` (hand-added re-export lines 256–276 assign to readonly getters) makes any discord.js import throw under Bun, blocking the whole test suite incl. `module_store.test.ts`. Re-run `bun test` once that node_modules breakage is fixed to confirm the runtime path.

## Phase F6 — Monorepo + shared contracts (§5, high risk) 🔗 **HARD scale prereq**

Multiple deployable services **must** share wire types. Refs: `.ai-knowledge/discordjs`, `.ai-knowledge/prisma` (both turbo monorepos).
- [x] Bun workspaces: packages `@ember/core`, `@ember/contracts`, `@ember/sdk`, plus apps `gateway`, `worker`, `scheduler`, `api`. Root is workspace-only (orchestration scripts + safety-net `imports` map for downloaded addons); all of `src/` moved to `packages/core/src/`; `main.ts` → `apps/worker/src/main.ts`; the three other apps are thin entrypoints that `import "@ember/worker/main"` until the real split (Part II, S2/S5). `docker-compose` runs `worker` by default; gateway/scheduler/api under the `scale` profile.
- [x] `@ember/contracts`: RPC payloads (`RpcRequest`/`RpcResponse`/`RpcHandler`), bus event envelope, module manifest (`ModuleManifest`/`TargetService`/`KNOWN_SUBSTORES`), config-field wire shape (`ConfigField`/`FieldType`) — single owner, zero runtime deps (discord.js type-only peer), re-imported by core. Ready for the dashboard repo to consume.
- [x] `@ember/sdk` for addons (re-exports the stable `@ember/core` surface — base classes, `cfg`, permissions, card factories, contracts — so addons compile against a package, not a `#core/*` symlink — the thing that broke F0).
- [x] Migrate dashboard RPC **server** (bot side) to `@ember/contracts` — kills duplicated types. `rpc.ts` now owns `RPC_ACTIONS` (action-name constants) + per-action request payload interfaces (`GdprDeletePayload`, `RepoAddPayload`, `RepoModulesPayload`, `ModuleInstall/UninstallPayload`, `ModuleTogglePayload`, `ConfigSetPayload`) keyed by `RpcRequestPayloads`. `CoreModule.ts` + `dashboard/index.ts` use the action constants for every register/deregister (no more string-literal dup) and annotate their Zod schemas `z.ZodType<…Payload>` so the runtime validators are bound to the shared wire types. Wiring the **external dashboard repo (caller)** to import these stays its own change (separate repo, per scope).
- [x] 🔬 cross-package typecheck clean (`bun run typecheck` over root `tsconfig.json`); `bun install` resolves the workspace; prisma client generates (via alpine container). ⚠ `bun test` not re-run here (4 pre-existing AFK mock failures, unrelated to the move); lint shows 3 pre-existing style errors in concurrent feature files (SortedCollection/ModuleStore/WorkerManager), not migration-related.

---

# PART II — Scale-out (Wick/Dyno-class)

> Build the distributed system. **Single-instance = the same services via docker-compose on one host.**
> Each phase ships behind a flag so the monolith path keeps working until the split is proven.

## Phase S0 — Observability baseline (do FIRST — you can't scale what you can't see)

Prometheus was removed in commit `1e57909`; re-introduce as cross-service, not bolted-on.
- [x] **Structured logs** (pino) with correlation/trace IDs propagated gateway→bus→worker. (`@ember/observability` + `PinoSapphireLogger`; bus/RPC envelopes carry W3C `traceparent`.)
- [x] **OpenTelemetry tracing** spanning services; one span per Discord event through bus to handler completion. (Command-piece base ctor wraps run methods; bus consume + RPC dispatch continue the parent trace.)
- [x] **Metrics (Prometheus/OTel)** per service — RED on command handling (rate/errors/duration), **queue depth & consumer lag**, **shard latency/heartbeat**, **REST 429 rate**, **cache hit ratio**, memory/shard. (`packages/observability/src/metrics.ts` + `/metrics` listener.)
- [x] Dashboards (Grafana) + alerts: shard down, lag growth, 429 spike, DB pool saturation. Added to `docker-compose.yml` under the `observability` profile (Prometheus + Grafana + Tempo + OTel Collector, provisioned in `config/observability/`).
- [x] 🔬 A traced command shows one connected trace across gateway→worker. (In the thin phase the four apps share the worker process — child DB/Redis/HTTP spans nest under the command span; full cross-service connectivity activates when S2 splits the gateway.)

## Phase S1 — Externalize ALL state (make the worker stateless) 🔗

Stateless workers are the precondition for horizontal scale + zero-downtime deploys.
- [x] Audit in-memory state: walked the workers' surfaces — `ConfigService` (no in-proc cache; reads go via `db.config` cache-aside in Redis), all `DatabaseService` repositories (Redis `getOrSet` + `InvalidationBus` busts), `FilterService` (`_guilds: Map` per-worker matcher cache; lazy-loaded from DB, has miss-then-rebuild retry — each worker independently warms, safe across restarts), `TempVcRegistry` (in-mem map + `InvalidationBus` broadcasts on every mutation — already cluster-synced), `WorkerManager` (per-process compute pool — intentional, not state), `container.stats` (per-shard counters — fine), `configChangeHooks` (function table, not data). The only true gap was `src/core/lib/guild-transaction.ts` whose `locks: Map<guildId, AsyncQueue>` + `configLocks` were per-process only.
- [x] Configure **discord.js cache sweepers + partials**: `EmberClient.ts` now declares `sweepers` (messages 10min lifetime, threads 1h, bot users only, guild members 30min) on top of the existing tight `makeCache` (zero presence/reaction/voice-state/sticker/emoji/invite/ban/AutoMod/etc., capped messages/threads/users/members). Partials unchanged (`Channel`, `GuildMember`). Full entity-cache externalization deferred to S8's gateway-proxy phase.
- [x] Per-guild serialization moved off `async-queue`: new `src/core/lib/redis-lock.ts` (`acquireRedisLock`) — `SET NX PX` with auto-renew at lease/2, fenced release via Lua, capped exponential backoff. `guild-transaction.ts` `createGuildTransaction` + `configLock` now hold `ember:lock:guild:<id>` / `ember:lock:cfg:<mod>:<id>` instead of in-proc `AsyncQueue` maps; transactions now mutually exclude across N worker processes. Lock TTLs: guild 15s, config 10s (auto-extended).
- [x] `InvalidationBus` survival across N workers: verified — `start()` subscribes the dedicated `subscriber` client to `ember:cache:invalidate`; every `invalidate()` does `DEL` locally then `PUBLISH`, so peers fire their `onInvalidate` listeners. `TempVcRegistry.wire()`, the `DatabaseService` repo `getOrSet`/`invalidate` flow, and the `ConfigService` change hooks already ride this bus. No code change needed in this phase.
- [ ] 🔬 Kill a worker mid-command; another picks up; no lost state, no double-effect. — **Deferred to S2** (only one worker process exists today; the chaos test is meaningful only after the gateway/worker split lands).

## Phase S2 — Event bus + gateway/worker split 🔗 ⚠

The core topology change. Recommended transport: **Redis Streams** (consumer groups).

**Slice 1 (substrate) — done.** New `@ember/event-bus` package: `EventBus` interface, `InProcBus` (EventEmitter, no broker — monolith default), `RedisStreamsBus` (XADD `MAXLEN ~` / XREADGROUP BLOCK / XACK, consumer groups lazily MKSTREAM-created), `createEventBus()` factory that reads `TRANSPORT=inproc|streams` + dedicated publisher/subscriber ioredis connections. Raw-packet wire envelope (`RawGatewayPacket`/`RawGatewayEnvelope` + `rawGatewayStream(type)` + `RAW_GATEWAY_CONSUMER_GROUP`) lives in `@ember/contracts` so gateway + worker share it. `RawGatewayPublisher` wraps `client.ws.handlePacket` so dispatches are published (with W3C `traceparent` + `guild_id` partition hint); `RawGatewayConsumer` consumes envelopes and replays them via `client.ws.handlePacket(packet, {id: shardId})`, continuing the trace via `extractTraceContext`. Bus is constructed in `EmberClient` and exposed as `container.eventBus` + `container.eventBusTransport`; closed in `destroy()`. Env: `TRANSPORT`, `EVENT_STREAM_MAXLEN`. Default `inproc` keeps monolith behavior unchanged.
- [x] **Slice 1 — bus substrate behind `TRANSPORT` flag (above).**
- [x] **Slice 2 — wire the split.** New `EmberRole` (`monolith` | `gateway` | `worker`) in `packages/core/src/core/env.ts`, read by `EmberClient` constructor (defaults from `EMBER_ROLE` env). `apps/gateway/src/main.ts` is now a real entrypoint: plain discord.js `Client` (no Sapphire stores, zeroed cache), attaches `RawGatewayPublisher`, owns its own `createEventBus({transport:'streams'})`, refuses to start on `TRANSPORT=inproc`. In `worker` role `EmberClient._installWorkerPatches()` monkey-patches `client.ws.connect` to a no-op so `super.login(token)` runs every Sapphire startup step (stores, command sync) without opening a Discord WS; once login resolves, a `RawGatewayConsumer` is constructed against `client.ws.handlePacket` to drive dispatches. Stable consumer id from `EMBER_CONSUMER_ID` env → falls back to `$HOSTNAME` → `worker-<pid>` (`getConsumerId()`). Monolith path unchanged (default role, default `TRANSPORT=inproc`).
- [x] **Slice 2 — interaction routing.** Path (a) wired and **flag-gated** by `INTERACTION_DEFER_AT_GATEWAY`. When `true`: gateway intercepts `INTERACTION_CREATE`, awaits a REST `interactionCallback` (type 5 for app-command / modal-submit, type 6 for message-component, skips type 1/4), then publishes to `ember:gw:interaction_create` — `RawGatewayPublisher` is told to ignore that dispatch so it doesn't double-publish. Worker installs `installPreDeferredInteractions()` (new `packages/core/src/core/lib/pre-deferred-interactions.ts`), patching `ChatInputCommandInteraction`/`ContextMenuCommandInteraction`/`ModalSubmitInteraction`/`MessageComponentInteraction` prototypes so `deferReply`/`deferUpdate` become flag-flipping no-ops — existing handlers' `editReply`/`followUp` calls keep working unchanged. Default `false` in `.env.example` (path b) to A/B test the bus-only path before flipping production.
- [x] **Slice 3 — backpressure + DLQ.** `RedisStreamsBus` now runs an XAUTOCLAIM loop per consumer (`claimMinIdleMs`/`claimIntervalMs`, defaults 60s/30s). Redelivered messages surface `deliveryCount > 1`; once it exceeds `maxDeliveries` (default 5) the entry is XADD'd onto `<stream>:dlq` (with `src_id`/`src_stream`/`delivery_count`/`dead_at` metadata) and XACKed off the live stream. New Prometheus gauges `ember_stream_length`, `ember_stream_consumer_lag{stream,group}`, `ember_stream_dlq_length` in `@ember/observability`, fed by a periodic `onStats` callback (`statsIntervalMs`, default 10s) wired up in `EmberClient` and `apps/gateway/src/main.ts`. Grafana alerts `StreamConsumerLag` (>1000 pending for 5m) and `StreamDlqGrowing` (DLQ non-empty for 1m) added to `config/observability/alerts.yml`. Env knobs (`EVENT_STREAM_MAX_DELIVERIES`, `EVENT_STREAM_CLAIM_MIN_IDLE_MS`, `EVENT_STREAM_CLAIM_INTERVAL_MS`, `EVENT_STREAM_STATS_INTERVAL_MS`) documented in `.env.example`.
- [x] **Slice 3 — single-instance path.** `docker-compose.yml` already had `worker` (default profile, inproc, monolith role) and the `scale` profile with `worker-scale` (TRANSPORT=streams, EMBER_ROLE=worker) + `gateway` (TRANSPORT=streams, EMBER_ROLE=gateway). Fixed `scheduler`/`api` `depends_on` to reference `worker-scale` instead of the monolith `worker` so `--profile scale up` starts cleanly. `apps/gateway/src/main.ts` is a real entrypoint (plain discord.js, zero Sapphire); `apps/worker/src/main.ts` is real via the role-aware `EmberClient` (worker role no-ops the WS connect and attaches `RawGatewayConsumer`).
- [x] 🔬 **(S1's deferred chaos test, lands here.)** New `scripts/chaos-streams.ts` (`bun scripts/chaos-streams.ts`, real Redis required) exercises both paths: (1) workerA's handler throws → workerA stops → workerB joins and XAUTOCLAIMs the stalled entry, observing `deliveryCount=2` and acking; (2) a perpetually-throwing handler against a fresh stream hits the DLQ threshold and the entry lands on `<stream>:dlq` after `maxDeliveries`. Verified end-to-end against the docker-compose Redis. **No lost effect** (the message is always re-delivered) and **no silent double-effect** beyond handler-controlled redelivery (`deliveryCount` is surfaced so handlers can dedupe).

## Phase S3 — Sharding & cluster orchestration 🔗 ⚠

- [x] **Slice 1 — `/gateway/bot` pre-flight + bucketed IDENTIFY.** New tiny `@ember/sharding` workspace package (only `@discordjs/rest` + `@discordjs/ws` + `discord-api-types` deps so the gateway service doesn't drag in `@ember/core`). `planShards({token, log})` calls `GET /gateway/bot`, resolves shard count from `TOTAL_SHARDS` (numeric pin, `auto`, or unset → recommended), parses `SHARD_LIST` with validation (rejects ids ≥ shardCount), refuses to start when `session_start_limit.remaining < shardsToIdentify` (escape hatch `SHARD_IDENTIFY_FORCE=true`) so crash loops can't burn the daily IDENTIFY budget and 401 the bot, and logs the plan (`recommendedShards`, `maxConcurrency`, `sessionStart{total,remaining,resetAfterMs}`, `gatewayUrl`) on every boot for capacity planning. `buildSimpleThrottlerFactory(plan)` returns the `ws.buildIdentifyThrottler` callback wrapping `SimpleIdentifyThrottler(maxConcurrency)` so discord.js IDENTIFYs are bucketed by `shardId % max_concurrency` (slice 2 will swap this for a Redis-backed throttler shared across gateway replicas). Wired into both entrypoints: `apps/gateway/src/main.ts` calls `planShards` before constructing `Client`, and `EmberClient` gains a static async `bootstrap()` factory that calls `planShards` for monolith roles (skipped for `EMBER_ROLE=worker`, which never opens a WS); `apps/worker/src/main.ts` now `await EmberClient.bootstrap()`. New env knobs (`TOTAL_SHARDS=auto`, `SHARD_IDENTIFY_FORCE`) documented in `.env.example`.
- [x] **Slice 2 — cluster manager.** New `ClusterCoordinator` in `@ember/sharding` (Redis-only, no discord.js coupling). Each replica `join()`s by `ZADD`ing itself into `ember:cluster:<name>:members` with heartbeat=now, subscribes to `ember:cluster:<name>:rebalance`, then reads (or recomputes-under-leader-lock) the assignment at `ember:cluster:<name>:assignment`. `assignShards(replicaIds, shardCount)` divides shards into balanced contiguous chunks (sorted by replicaId) so a single join/leave shifts at most one shard per chunk boundary — preserving warm sessions across rebalance. Heartbeat loop (5s) refreshes ZSET score and reaps members older than `memberTtlMs` (15s default); whichever replica wins `SET NX EX` on `:leader-lock` rewrites the assignment and `PUBLISH`es the new epoch. `attachCluster()` glue layer wires this with `RedisSessionStore` + `RedisIdentifyThrottler` for the gateway and `EmberClient` (monolith) when `CLUSTER_NAME` is set; both entrypoints register an `onRebalance` callback that drains and exits when this replica's shard set changes — the next process boot RESUMEs via the shared session store. `RedisIdentifyThrottler` enforces the 5s IDENTIFY window per `shardId % max_concurrency` bucket cluster-wide via `SET NX PX 5000`, so two replicas can't collide on the same bucket. New env knobs (`CLUSTER_NAME`, `EMBER_CONSUMER_ID`) documented in `.env.example`. **Note:** in-place mid-flight reshard is intentionally not implemented — `@discordjs/ws` caches `shardIds`, so attempting to swap a live shard without re-spawning the manager is fragile; draining + restart is honest and lets RESUME cover the cost.
- [x] **Slice 3 — Session resumption.** `RedisSessionStore` persists `SessionInfo` (resumeURL/sessionId/sequence/shardId/shardCount) per shard in `ember:cluster:<name>:session:<shardId>` with a 5-minute TTL (matches Discord's invalidation window). Wired into `ws.retrieveSessionInfo`/`ws.updateSessionInfo` on both the gateway entrypoint and `EmberClient` (monolith) when clustered. Hot-path writes (every dispatch updates `sequence`) are coalesced with a 1s flush interval to keep Redis QPS bounded; the in-memory pending map is authoritative between flushes and is synchronously flushed on shutdown. Session lookup is keyed by shardId alone (not replicaId), so a replica taking over a shard after a rebalance RESUMEs the previous owner's session for free.
- [x] **Slice 4 — Capacity math documented** at `docs/explanation/capacity-planning.md`: guilds → shards (2k/shard, +20%) → gateway replicas (~32 shards/replica before event-loop lag bites) → RSS budget (350 MB + 6 MB/shard + 25 KB/guild) → worker replicas (KEDA-scaled on consumer-group lag, ~250 dispatch/s/worker today) → IDENTIFY budget arithmetic (RESUMEs are free; rebalances cost ≤ K IDENTIFYs for K shards that changed owner; re-shards cost N). Worked example for 50k guilds: 25 shards, 1 gateway, 3 workers, ~3.5 GB total cluster RSS.
- [x] 🔬 New `scripts/chaos-cluster.ts` (real Redis required) exercises the protocol end-to-end. Scenario 1: three replicas spawn into an empty cluster, assignment covers all shards and the largest/smallest range differ by ≤1. Scenario 2: kill one replica, the surviving two re-own the orphaned shards (asserted via `onRebalance` deltas — `added` covers the orphans, no spurious `removed` on shards that didn't change owner). Scenario 3: a fourth replica joins, all three rebalance to balanced ranges. Scenario 4: `RedisSessionStore` round-trip across replicas — replica A writes shard 0's SessionInfo, replica B retrieves the same payload (this is what makes RESUME-after-rebalance work in production). `assignShards()` also unit-checked via the pure-function entrypoint. Lives under `scripts/` like `chaos-streams.ts`.

## Phase S4 — Shared REST / rate-limit proxy 🔗

At 1000s of workers, per-process rate limiting causes global 429s/bans.
- [x] **Shared outbound proxy.** `nirn-proxy` (`ghcr.io/germanoeich/nirn-proxy`) lives under the `scale` profile in `docker-compose.yml` — listens on `:8080` (Discord-API-compatible surface) and exposes its own `/metrics` on `:9000`. Workers + gateway under the scale profile depend on it and default `DISCORD_PROXY_URL=http://nirn-proxy:8080`; single-host monolith leaves the var empty and talks to discord.com directly. Prometheus scrape target added in `config/observability/prometheus.yml`. Host port maps `127.0.0.1:18080`/`19000` for the loadtest script + ad-hoc prom checks.
- [x] **discord.js REST → proxy.** New `packages/core/src/core/lib/discord-rest.ts` (`buildRestOptions()`) reads `DISCORD_PROXY_URL` via `getDiscordProxyUrl()` and returns `{ api: "${proxy}/api", globalRequestsPerSecond: Infinity, invalidRequestWarningInterval: 500 }`. Setting the local global throttle to ∞ is intentional — once the proxy is authoritative, double-throttling just adds latency without buying safety. Wired into `EmberClient` (`ClientOptions.rest`) so every internal discord.js REST call goes through the proxy, and into `apps/gateway/src/main.ts` for both the standalone `new REST()` used by `INTERACTION_DEFER_AT_GATEWAY` *and* the gateway client's internal REST. `.env.example` documents the var.
- [x] **Metrics.** Two new ones in `@ember/observability`: `ember_rest_retry_after_seconds` histogram `{route,method,global}` (per-route retry-after distribution; observed from the `rateLimited` event), and `ember_rest_invalid_request_warnings_total` counter (one tick per `invalidRequestWarning` emit = 500 invalid 401/403/429 responses in the 10-min window). Wired in `packages/core/src/core/listeners/telemetryStats.ts` for the worker/monolith and inline in `apps/gateway/src/main.ts` for both the client REST and the standalone REST. New Grafana alert `RestInvalidRequestSurge` (`alerts.yml`) fires at >0.1 emits/s sustained — well below the 10k/10min CloudFlare ban threshold.
- [x] 🔬 **Load test.** New `scripts/loadtest-rest.ts` (`BOT_TOKEN=… bun scripts/loadtest-rest.ts`) spawns `WORKERS` parallel `@discordjs/rest` clients pointed at `DISCORD_PROXY_URL` (defaults to the host-mapped proxy at `127.0.0.1:18080`), fires `REQUESTS_PER_WORKER` `GET /users/@me` calls each, then asserts `rateLimits == 0` and `errors == 0`. A/B against the direct path with `DISCORD_PROXY_URL="" bun scripts/loadtest-rest.ts` to confirm the proxy actually changes the outcome. Default sizing (10×50 = 500 reqs) keeps the test fast; bump `WORKERS=20 REQUESTS_PER_WORKER=100` for the documented 1000-call scenario.

## Phase S5 — Scheduler as a service + durable jobs at scale 🔗

- [x] Extract `scheduler` app owning BullMQ (Redis DB 1); workers only *consume* job effects via the bus, don't schedule competing timers. Done by gating the `@sapphire/plugin-scheduled-tasks/register` import on `roleOwnsScheduler(role)` in `packages/core/src/client/setup.ts` — workers never spin up a BullMQ Worker, only the scheduler/monolith does. Two new bus contracts in `#lib/scheduler-bus.js`: workers publish `RequestEnvelope`s on `ember.scheduler.request` (`scheduleTask()` / `cancelTask()` helpers in `#lib/schedule-task.js` route through it), the scheduler's `SchedulerRequestConsumer` translates them back into `container.tasks.create()` / `.delete()`. When a BullMQ job comes due each `ScheduledTask.run()` re-publishes onto `ember.scheduler.fire:<name>`; workers register fire-handlers via `registerTaskFireHandler(name, "unicast" | "broadcast", handler)` and a `TaskFireConsumer` (started in `EmberClient.login()` when `roleExecutesTaskEffects(role)`) routes each fire to the right module — mod-lift / afk-delete-message / tempvc-cleanup / thread-cleaner-task / flush-logs unicast; captcha-expiry broadcast since it iterates `client.guilds.cache`. New `apps/scheduler/src/main.ts` boots a real EmberClient in `scheduler` role (Discord WS suppressed, BullMQ on); docker-compose `scheduler` service sets `EMBER_ROLE=scheduler` + `TRANSPORT=streams`. Known follow-up: unicast fire-streams aren't shard-routed yet, so on a multi-worker fleet a job for guild G can land on a worker that doesn't have G in its cache and silently no-op (next phase).
- [x] **Re-arm outstanding jobs on boot** (pattern: `ModModule.reconcileExpiryJobs`) — make this a first-class lifecycle hook for every scheduled-task module. Promoted to `Module.reconcileScheduledJobs()`: the base `Module.onLoad()` schedules it (with error logging) so subclasses just override the hook. `ModModule` migrated; the previous private `reconcileExpiryJobs` is gone. `afk` and `tempvc` rely on BullMQ's own persistence + idempotent jobIds and don't need a reconcile pass — `mod` does because it owns a DB-of-record (cases) the scheduler must be re-synced against.
- [x] Apply F2's **`catchUp`** policy per task (fire-on-boot vs drop vs spread). All delayed one-shot tasks (`mod-lift`, `afk-delete-message`, `tempvc-cleanup`) carry `CatchUpMeta` and gate `run()` on `shouldRunNow()`. The remaining tasks (`captcha-expiry`, `thread-cleaner-task`, `flush-logs`) are periodic interval/cron sweepers — they reconcile state each tick and have no single "scheduledFor" moment, so the policy is structurally N/A.
- [ ] HA: BullMQ on Redis with replication/Sentinel; single active scheduler (leader lock) or rely on BullMQ job locks.
- [ ] 🔬 Restart scheduler with overdue jobs; `catchUp` behaves per policy, no duplicates.

## Phase S6 — HA & zero-downtime deploys 🔗

- [ ] Every service multi-replica, no SPOF. Postgres primary+replica w/ failover; Redis Sentinel/Cluster; RabbitMQ mirrored.
- [ ] **Rolling deploys:** drain a gateway replica's shards to peers before kill (graceful handoff); workers drain in-flight events then exit (SIGTERM → stop consuming → finish acks).
- [ ] Health/readiness probes per service (`src/core/routes/health.ts` → split per app) gate traffic/shard assignment.
- [ ] 🔬 Deploy a new version under synthetic load with zero dropped commands and no shard-storm.

## Phase S7 — Cost / efficiency / autoscaling 🔗

- [ ] **KEDA (or HPA on custom metric)**: scale `worker` replicas on Redis Streams consumer lag; scale to floor when idle.
- [ ] PgBouncer (from F4) + tuned Prisma pool; Redis pipelining; right-size discord.js cache (S1).
- [ ] Per-shard & per-worker memory budgets enforced; profile + cap.
- [ ] Cost dashboard: $/guild, memory/shard, cache hit ratio trends (S0).
- [ ] 🔬 Idle cluster scales workers to floor; load spike scales out within SLO.

## Phase S8 — Gateway-proxy cutover (max scale, do last) ⚠

When discord.js-in-gateway memory/coupling becomes the bottleneck (≈ low-hundreds-of-k guilds):
- [ ] Replace discord.js gateway with a dedicated proxy (Twilight-gateway / custom WS) that only decodes + publishes; workers drop the gateway connection entirely and become pure REST + bus consumers.
- [ ] **Transport cutover Redis Streams → NATS JetStream** if fan-out throughput demands it (documented threshold).
- [ ] Externalize entity cache fully to Redis (workers stateless re: Discord objects).
- [ ] 🔬 Gateway proxy + stateless workers handle target event rate within latency SLO.

---

## Single-instance guarantee (every phase)

- [ ] `docker-compose.yml` brings up **all** services + Postgres + Redis + RabbitMQ (+ NATS at S8) on one host, replicas=1.
- [ ] A self-hoster runs `docker-compose up` and gets a working bot — no manual multi-service wiring.
- [ ] Each split (S2, S5, S8) keeps a monolith/compose path until the distributed path is proven in staging.

## Cross-cutting gates (after every phase)

- [ ] `bun run typecheck` · `bun run lint` · `bun test` green.
- [ ] Golden-path smoke in a real guild for touched modules.
- [ ] CLAUDE.md / `.skills/ember-*.md` updated when a contract changes.
- [ ] New service/transport → load + chaos test before it carries real traffic.

Check if:
  1. The Unicast Shard-Routing Failure (Critical Gap): BullMQ task fires (e.g., removing a temporary mute) are published on the general task-fire bus as unicast events. If a worker     
  replica consumes this fire but does not happen to hold the target Guild in its local Discord.js cache (because that guild belongs to a gateway shard it isn't reading), the worker     
  silently no-ops, causing the scheduled action to fail to execute.
  2. Local DJS Cache-Heaviness: Workers are still memory-heavy due to maintaining local Discord.js caches for Guilds, Channels, and Roles. Supporting massive scale (100k+ servers) will 
  eventually require full externalization of the entity cache to Redis.
  3. Graceful In-Place Resharding Limitation: When sharding assignments are rebalanced, gateway replicas are forced to completely drain and restart the process rather than dynamically  
  spawning/destroying individual WS connections in-place, which triggers high-volume reconnect loops on Discord's gateway.
  4. Redis Streams Throughput Ceiling: At very high event rates (e.g. >20k/s), a single Redis instance hosting the event bus will eventually saturate its CPU due to single-threaded     
  command processing, making a transition to NATS JetStream necessary
