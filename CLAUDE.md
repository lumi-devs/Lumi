# Lumi-TS — Claude Code Guidelines

## Stack

- **Runtime**: Bun
- **Framework**: Sapphire v5 (`@sapphire/framework`, `@sapphire/plugin-*`)
- **Discord**: discord.js v14 + `@discordjs/builders` + `@discordjs/formatters`
- **DB**: Prisma + PostgreSQL (pg adapter), ioredis
- **Messaging**: RabbitMQ (amqplib) + BullMQ (`@sapphire/plugin-scheduled-tasks`, Redis-backed)
- **i18n**: `@sapphire/plugin-i18next` (per-guild locale, typed keys)
- **Validation**: Zod

---

## Architecture

### Layout

**Monorepo** — Bun workspaces: `packages/*` (`@lumi/core`, `@lumi/event-bus`, `@lumi/observability`, `@lumi/contracts`, `@lumi/sharding`, `@lumi/sdk`) + `apps/*` (`@lumi/gateway`, `@lumi/worker`, `@lumi/scheduler`). The bot itself is **`@lumi/core`** (`packages/core/`); every `src/…` path below is rooted at **`packages/core/src/`**. `apps/*` are thin deployment entrypoints (see _Runtime roles_), `packages/*` are the libraries they compose; cross-package imports use the `@lumi/*` names, never relative paths between packages.

- `src/core/` — framework glue, registered as a Sapphire base path. Holds the command/listener/precondition/service base classes, the module system, the DB & Redis layers, the RabbitMQ bridge, and the core commands (`/lumi` — the single control-panel hub, with `/module`, `/permissions`, `/help`, `/ping`, `/prefix`, `/language`, `/dashboard`, `/download`, `/repo`).
- `src/modules/` — feature modules (see below). The `ModuleStore` root.
- `src/database/` — `client.ts` (Prisma) and `redis.ts` (`RedisKeys`, `RedisTTL`, `createRedisClient`, `InvalidationBus`).
- `src/prisma/DatabaseService.ts` — the **only** sanctioned data-access layer for features (`container.db`). Wraps Prisma + Redis cache-aside.
- `src/utilities/` — `cards.ts`, `time.ts`, `errors.ts`, `assets.ts`, branding, resolvers.
- `src/workers/` — `WorkerManager` for CPU-bound jobs.

### Path aliases (package.json `imports`)

These resolve **within `@lumi/core`** (`packages/core/package.json` `imports`): `#core/*`, `#modules/*`, `#database/*`, `#utilities/*`, `#workers/*`, `#root/*` (= `packages/core/src/*`), and the `#lib/*` aliases: `#lib/commands.js`, `#lib/env.js`, `#lib/permissions.js`, `#lib/rabbit.js`, `#lib/guild-transaction.js`, `#lib/module-check.js`, `#lib/types.js`, `#lib/module-system.js`, `#lib/schedule-task.js`, `#lib/scheduler-bus.js`. Always import via these inside `packages/core`, never deep relative paths across layers; from other packages/apps import the `@lumi/*` package name. Note the `.js` suffix on specifiers even though sources are `.ts`.

### Module system

Each feature lives in `src/modules/<name>/` with an `index.ts` exporting a class decorated with `@DefineModule({ name, displayName, emoji, version, description, configFields?, dependencies?, conflicts?, isCore? })`. `ModuleStore` discovers modules by walking for `index.ts` files that export module `meta`, applies conflicts, topo-sorts by `dependencies`, then registers each module dir as a Sapphire path so its sub-stores load.

Sub-store directories inside a module (each optional):

- `commands/` — `BaseCommand` / `BaseSubcommand` pieces
- `listeners/` — extend `ModuleListener` (`#core/module-system/ModuleListener.js`; guild resolution + module-enabled gate built in, implement `handle()`), or `GuildMessageListener` for user messages (router-fed: webhooks/system/bots/DMs pre-filtered). Raw Sapphire `Listener` only when the listener must run while its module is disabled (e.g. tempvc leftover cleanup).
- `interaction-handlers/` — buttons / selects / modals
- `services/` — `Service` pieces (singletons, see below)
- **`scheduled-tasks/`** — BullMQ `ScheduledTask` pieces. **The directory MUST be named `scheduled-tasks/`** (the `ScheduledTaskStore`'s name). A dir named `tasks/` is silently never scanned — `StoreRegistry.registerPath(dir)` appends each store's `.name` to the path. Same rule for `src/scheduled-tasks/` at the root.
- `data.ts` / `keys.ts` / `lib/` / `ui/` — plain helpers, not pieces.

**Zero cross-module imports.** Modules never import from sibling modules. Shared logic goes in `src/core/` or `src/utilities/`. Modules can be globally enabled/disabled (DB-backed, cluster-synced via `InvalidationBus`); the `ModuleEnabled` precondition is auto-attached to every command owned by a module so disabling a module gates its commands.

Per-user data cleanup: override `deleteUserData(userId, requester)` on the module class — it is invoked by the GDPR deletion flow (`src/core/lib/gdpr.ts`).

### Services

Extend `Service` (`#core/module-system/Service.js`); they expose `this.logger`, `this.db`, `this.redis`. Decorate with `@ApplyOptions<Piece.Options>({ name: "<svc>" })`, augment the `Services` interface in the same file (`declare module "#core/module-system/Service.js" { interface Services { "<svc>": MyService } }`), and retrieve with `getService("<svc>")` — typed, throws if not loaded — or `tryGetService("<svc>")` where a missing piece is expected (module disabled, boot order). Never `stores.get("services").get(...) as X`. Services are the place for stateful/singleton logic (e.g. `FilterService` per-guild matchers, `TempVcService`).

### Permissions

`PermissionLevel` (`#lib/permissions.js`): `USER(0) < MOD(5) < ADMIN(7) < GUILD_OWNER(8) < BOT_OWNER(10)`. Set `permissionLevel` on a command's options and `BaseCommand` auto-appends the matching precondition (`Moderator` / `Administrator` / `GuildOwner` / `BotOwner`) and maps it to a Discord `defaultMemberPermissions`. Per-command, per-guild allow/deny overrides (user/role/channel/category/everyone) are enforced by the `PermissionOverrides` precondition.

### Config

**Zod-first.** Declare a single `configSchema: cfg.object({ ... })` in the module meta, building each field with the `cfg.*` helpers from `#core/module-system/Module.js` (`cfg.boolean / number / string / enum / channel / role / user`). The schema is the source of truth: the flat `ConfigField[]` the `/lumi` panel (Modules tab) and dashboard RPC consume is **derived** from it (`fieldsFromSchema`, run by the `DefineModule` decorator) — never hand-author `configFields`. The panel reads/writes via `ConfigService`, which `coerce()`s the raw string to the field type, then **validates the coerced value against the schema**, and stores JSON. **`STRING` fields are stored verbatim**; for comma-separated values pass `cfg.string({ ..., list: true })` and read them as `string[]` via `ConfigService.getConfigList` (the one shared `parseConfigList` transform) — never split inline. Register a cache-invalidation/reload hook with `container.configChangeHooks.set("<module>:<key>", fn)` instead of patching `ConfigService`. Per-scope overrides (user > channel > role > category > guild) via `ConfigService.getConfig(..., ctx)`.

### Internationalization (i18n)

**`@sapphire/plugin-i18next`.** Translations live in `src/languages/<locale>/<namespace>.json`; shipping locales are **`en-US`** (default/source of truth), **`de`**, **`es-ES`**, **`fr`**, and the namespaces are `common` (default), `commands`, `preconditions`. Command/option **names** stay English across locales (Discord naming rules + muscle memory); descriptions, titles and bodies are translated. Config is centralised in **`#core/i18n/index.js`** (`buildI18nOptions`, wired into `LumiClient`; the plugin is registered in `client/setup.ts`). Language is resolved per-guild via `fetchLanguage` (reads `Guild.locale` through `container.db.config.getGuildSettings`), falling back to Discord's `guild.preferredLocale` → `en-US`.

- **Adding a language is additive**: drop a `src/languages/<locale>/` dir with the same keys as `en-US`, then add the locale to `SUPPORTED_LANGUAGES` in `#core/i18n/index.js`. The `i18n.test.ts` key-parity guard fails if a locale drifts from `en-US`.
- **Keys are typed** via the `CustomTypeOptions` augmentation (`#core/i18n/augmentations.d.ts`) — `t("commands:foo")` autocompletes and type-checks.
- In commands, get a translator with **`await this.fetchT(interactionOrMessage)`** (returns a `LumiT` bound to every namespace). Localize slash-command name/description with `applyLocalizedBuilder(builder, "commands:<root>")` (auto-appends `Name`/`Description`). For one-off lookups outside a command use `resolveKey(target, key, options)`.
- Set a guild's language with `/language` or `GuildSettingsService.setLanguage` (validates against `SUPPORTED_LANGUAGES`, cache-busts via the guild transaction).

### Data & cache

- Use **`container.db`** (`DatabaseService`) for all persistence in features — never call `container.prisma` directly from a module. KV helpers: `getModuleData`/`setModuleData` (keyed `guildId+module+targetId+key`); config: `getModuleConfig`/`setModuleConfig`.
- All Redis keys come from **`RedisKeys`** in `src/database/redis.ts`; never hard-code a key string. TTLs live in `RedisTTL`.
- Cache-aside reads go through `DatabaseService.getOrSet`. Cache busts go through `InvalidationBus` (`#invalidate`) so peer processes drop their copies too — never `redis.del` a shared cache key directly.
- **`container.entityCache`** (`RedisEntityCache`, `#core/entity-cache/RedisEntityCache.js`) is a Redis projection of core gateway entities (guild/channel/role/user/member), written by the entity-populator on the `monolith` + `worker` roles. It is **provisioned-ahead infra for a future `GuildManager: 0` step, not yet a read path** — the accessors (`guild()/channel()/role()/user()/member()`) exist but have zero callers, there is no enumerate-all, and it holds no action methods. Keep reading from discord.js's own caches; don't migrate call sites onto it until that step is actually taken (it needs `GuildManager: 0` + an enumerate accessor + a REST-for-actions policy first).

### Runtime roles & scale-out

The same `@lumi/core` build runs in one of four roles selected by **`LUMI_ROLE`** (`monolith` default | `gateway` | `worker` | `scheduler`); the helpers live in `#lib/env.js` (`getServiceRole`, `roleOwnsScheduler`, `roleExecutesTaskEffects`). **`docker compose up` with no profile boots a single `monolith`** (full WS + BullMQ + all module work in one process) — that path is sacred; the split roles are opt-in for scale-out.

- **monolith** — everything in-process. **gateway** (`apps/gateway`) holds the Discord WebSocket and publishes every raw dispatch packet onto the event bus; runs no module logic. **worker** (`apps/worker`) has no WS (`ws.connect` is patched to a no-op), consumes raw packets off the bus to populate its cache, and runs all command/module work — it's the canonical full-client entrypoint (`LumiClient.bootstrap()`, role from env). **scheduler** (`apps/scheduler`) has no WS, owns the BullMQ Queue + Worker, and re-publishes task effects onto `lumi.scheduler.fire:<name>` for workers to execute (`#lib/scheduler-bus.js`). There is no dedicated api app: dashboard RPC (RabbitMQ request/response) is served by every worker via competing consumers.
- **`TRANSPORT`** (`inproc` default | `streams` | `nats`) selects the `@lumi/event-bus` backend via `createEventBus`. `inproc` keeps a monolith self-contained; `streams` (Redis Streams) / `nats` (JetStream) carry events between split roles.
- **`CLUSTER_NAME`** turns on the Redis-backed cluster coordinator (shard-range assignment, session resumption, shared IDENTIFY throttling). Unset → single-replica path (`SHARD_LIST` honored, sessions not persisted).
- **HA (S5):** `REDIS_SENTINELS` (comma-separated `host:port`) points every Redis client at Sentinel for master discovery + failover (`REDIS_SENTINEL_NAME`, default `mymaster`); `SCHEDULER_LEADER_LOCK=true` makes a `scheduler` replica acquire a Redis leader lock before `login()` so only one fires jobs (hot-standby), followers poll-block until it lapses.
- **Readiness & graceful shutdown** (`@lumi/observability`): each role registers dependency probes with `registerReadinessProbe(name, fn)`; `/healthz` (liveness, always 200 if up) and `/readyz` (readiness — 503 while draining or if any probe fails) are served on the **metrics port** (`METRICS_PORT`, default `9090`). The old Sapphire `@sapphire/plugin-api` `HealthRoute` is **gone**. SIGTERM handlers call `runDrainSequence(steps, opts)` — `markDraining()` → pre-close grace → bounded sequential drain steps under a hard deadline.

### Background work — two distinct systems

1. **Scheduled tasks** (BullMQ, Redis DB 1): delayed / exact-time / repeated jobs that must survive restarts. Define the piece in `scheduled-tasks/` by extending **`RelayTask<"name">`** (`#core/lib/scheduled-tasks.js`) with an empty body — it applies the payload's `catchUp` policy (`shouldRunNow`) then relays the fire onto the bus for workers; the Discord-touching work lives in a `lib/` handler registered via `registerTaskFireHandler`. Augment the payload type on the plugin's `ScheduledTasks` interface in the piece file, schedule with `container.tasks.create(...)` using a stable `customJobOptions.jobId` for idempotency. Re-arm outstanding jobs on module load if needed (see `ModModule.reconcileExpiryJobs`). For jobs that may come due during downtime, control fire-on-boot vs drop by extending the payload with `CatchUpMeta` and setting `catchUp: false` + `scheduledFor` at creation. CPU-bound work is offloaded directly to `WorkerManager` (worker threads), called by the feature that needs it — not via a broker.
2. **RabbitMQ events & RPC** (`#lib/rabbit.js`): cross-process **fanout events** (`publishEvent`/`onEvent` on `lumi.events`) and the request/response **RPC bridge** to the web dashboard (`registerRpcHandler`, gated by `isDashboardEnabled`). There is **no fire-and-forget job queue** — it was removed; use system 1 for background work.

### Observability (`@lumi/observability`)

Cross-service telemetry primitives — zero discord.js deps. App entrypoints call `bootstrapTelemetry("<service>")` from `apps/<svc>/src/telemetry.ts` **before any other import** (ESM hoisting: tracing must register before http/pg/ioredis/amqplib load). `apps/gateway` + `apps/worker` bootstrap full telemetry in `telemetry.ts`; `apps/scheduler` only sets `SERVICE_NAME` in `service-name.ts` before importing `@lumi/core/setup`.

- **Logger**: `PinoSapphireLogger` adapter (set on the Sapphire client). `createPinoLogger` injects `correlationId`/`traceId`/`spanId`/`guildId`/`userId` from the AsyncLocalStorage context. `LOG_LEVEL`, `LOG_FORMAT=json|pretty`.
- **Tracing**: `startTracing()` (gated on `OTEL_ENABLED`) registers a `NodeTracerProvider` + W3C propagator + auto-instrumentations. `withSpan(name, fn, options)` for manual spans. Command base class (`BaseCommand`/`BaseSubcommand`) wraps `chatInputRun`/`messageRun`/`contextMenuRun` so each invocation is one trace with child DB/Redis/HTTP spans nested. RabbitMQ `publishEvent` stamps `traceparent` on the envelope; consumers + `dispatchRpc` continue the trace.
- **Metrics**: prom-client registry, `/metrics` (plus `/healthz` + `/readyz`, see _Runtime roles & scale-out_) on `METRICS_PORT` (default `9090`). `commandsTotal{command,type,status}`, `commandDuration{command,type}` (RED); `busEventsPublished/Consumed{event}`, `queueDepth{queue}`, `shardLatency{shard}`/`shardStatus{shard}`/`guildCount`, `rest429Total{route,method,global}`, `cacheHits/Misses{cache}`, `pgPoolSize/Used/Waiting`. **Don't hand-create new metrics in modules** — add to `packages/observability/src/metrics.ts` so labels stay consistent.
- **Context**: `runWithContext({correlationId, source, guildId, userId})` to start a unit-of-work; `injectTraceContext()`/`extractTraceContext(carrier)` for new transport hops (envelope, RPC).
- **Stack**: opt-in via `docker compose --profile observability up` — Prometheus + Grafana + Tempo + OTel Collector with provisioned datasources/dashboards/alert rules in `config/observability/`. Apps always emit OTLP + serve `/metrics`; with the profile down the batch exporter degrades quietly.
- **Don't enable `OTEL_ENABLED` and `SENTRY_ENABLED` together** — Sentry v10 registers its own TracerProvider and will conflict.

---

## Library reference — use these, don't hand-roll

### `@discordjs/formatters`
Mention and timestamp helpers. Always use these instead of raw string construction.

| Use case | Helper |
|---|---|
| Relative timestamp `<t:…:R>` | `time(date, TimestampStyles.RelativeTime)` |
| Short time `<t:…:T>` | `time(date, TimestampStyles.ShortTime)` |
| User mention `<@id>` | `userMention(id)` |
| Channel mention `<#id>` | `channelMention(id)` |
| Role mention `<@&id>` | `roleMention(id)` |
| Escape markdown | `escapeMarkdown(str)` |

### `@sapphire/utilities`
General-purpose helpers. Import what you need; tree-shaken.

| Use case | Helper |
|---|---|
| Truncate to N chars | `cutText(str, n)` |
| Null / undefined check | `isNullish(v)` |
| Null / undefined / empty check | `isNullishOrEmpty(v)` |
| Type-safe `filter(Boolean)` | `.filter(filterNullish)` |
| Safe JSON parse — never throws; returns the input string (not null) on failure | `tryParseJSON(str)` — not generic; cast `as T \| null` and guard |
| `charAt(0).toUpperCase() + …` | `capitalizeFirstLetter(str)` |
| `str.charAt(0).toUpper + …Lower` | `toTitleCase(str)` |
| Split array into pages | `chunk(arr, size)` |
| Escape regex metacharacters | `regExpEsc(str)` |
| Awaitable union type | `Awaitable<T>` |
| Random element | `pickRandom(arr)` |
| Deep clone | `deepClone(obj)` |

### `@sapphire/time-utilities`
Duration parsing and formatting.

| Use case | Helper |
|---|---|
| Parse `"1h30m"` → milliseconds | `new Duration(str).offset` |
| Format ms → human string | `new DurationFormatter().format(ms)` |

> **Note**: `DurationFormatter` produces verbose output ("1 hour 30 minutes").
> Use the custom `formatDuration()` in `src/utilities/time.ts` for compact uptime format.

### `@sapphire/stopwatch`
Timing measurements. Replaces `performance.now()` pairs.

```ts
const sw = new Stopwatch();
const result = await operation();
sw.stop();
container.logger.warn(`Took ${sw}`); // "123.45ms"
```

### `@sapphire/fetch`
Typed `fetch()` wrapper. Use instead of raw `fetch()` for HTTP requests.

```ts
import { fetch as sfetch, FetchResultTypes } from "@sapphire/fetch";
// Text — no type arg needed, returns Promise<string>
const text = await sfetch(url, FetchResultTypes.Text);
// JSON — type arg required, returns Promise<T>
const json = await sfetch<MyType>(url, FetchResultTypes.JSON);
```

### `@sapphire/discord.js-utilities`
Channel type guards and Discord.js utilities.

```ts
import { isTextBasedChannel, isGuildBasedChannel } from "@sapphire/discord.js-utilities";
```

> **PaginatedMessage note**: This class is embed-centric. Lumi uses ContainerBuilder (v2 components)
> for all cards. Do NOT use PaginatedMessage — use `chunk()` + the existing button navigation
> pattern instead (see `src/modules/afk/interaction-handlers/mentions.ts`).

### `@sapphire/async-queue`
Per-guild serialization. Already used in `src/core/lib/guild-transaction.ts`.

### `@sapphire/snowflake`
Extract creation timestamp from any Discord ID.

```ts
import { DiscordSnowflake } from "@sapphire/snowflake";
const createdAt = DiscordSnowflake.timestampFrom(id); // ms epoch
```

---

## What NOT to hand-roll

- Raw `<@id>`, `<#id>`, `<@&id>` strings → use formatters
- Raw `<t:seconds:R>` strings → use `time()`
- `str.charAt(0).toUpperCase() + str.slice(1)` → use `capitalizeFirstLetter` or `toTitleCase`
- `JSON.parse` inside a try/catch for Redis data → use `tryParseJSON`
- `.filter(Boolean)` on typed arrays → use `.filter(filterNullish)`
- `performance.now()` pairs → use `Stopwatch`
- Raw `fetch()` for HTTP → use `@sapphire/fetch`

---

## Commands and base classes

All commands extend `BaseCommand` (not raw `Command`) or `BaseSubcommand`.
`defaultMemberPermissions`, `contexts` and `integrationTypes` are applied to
every registered builder **automatically** (the base ctor shadows
`registerApplicationCommands` — see `autoApplyCommandDefaults` in
`#lib/commands.js`); never call the three setters in a builder chain unless a
command intentionally overrides one of them. Reply with `this.replySuccess` /
`replyError` / `replyWarning` / `replyInfo` (ephemeral card by default) or
`this.reply(interaction, payload)` — never raw `interaction.reply` with a
hand-spread card, and never OR `MessageFlags.Ephemeral` yourself (use
`ephemeralCard(card)`).

## Card system

All replies use `makeInfoCard`, `makeSuccessCard`, `makeErrorCard`, `makeWarningCard`, `makeListCard`
from `src/utilities/cards.ts`. These return `CardReply` (ContainerBuilder + `IsComponentsV2` flag).
Never construct raw embeds for user-facing responses.

## Pagination pattern

For paginated lists, use `chunk(lines, N)` from `@sapphire/utilities` to split into pages.
Add `{ footer: "Page X/Y • N total" }` to the card options. For interactive multi-page navigation,
follow the button handler pattern in `src/modules/afk/interaction-handlers/mentions.ts`.
