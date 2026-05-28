# Ember-TS — Claude Code Guidelines

## Stack

- **Runtime**: Bun
- **Framework**: Sapphire v5 (`@sapphire/framework`, `@sapphire/plugin-*`)
- **Discord**: discord.js v14 + `@discordjs/builders` + `@discordjs/formatters`
- **DB**: Prisma + PostgreSQL (pg adapter), ioredis
- **Messaging**: RabbitMQ (amqplib) + BullMQ (`@sapphire/plugin-scheduled-tasks`, Redis-backed)
- **Validation**: Zod

---

## Architecture

### Layout

- `src/core/` — framework glue, registered as a Sapphire base path. Holds the command/listener/precondition/service base classes, the module system, the DB & Redis layers, the RabbitMQ bridge, and the core commands (`/config`, `/module`, `/permissions`, `/help`, `/ping`, `/prefix`, `/dashboard`, `/download`, `/repo`).
- `src/modules/` — feature modules (see below). The `ModuleStore` root.
- `src/database/` — `client.ts` (Prisma) and `redis.ts` (`RedisKeys`, `RedisTTL`, `createRedisClient`, `InvalidationBus`).
- `src/prisma/DatabaseService.ts` — the **only** sanctioned data-access layer for features (`container.db`). Wraps Prisma + Redis cache-aside.
- `src/utilities/` — `cards.ts`, `time.ts`, `errors.ts`, `assets.ts`, branding, resolvers.
- `src/workers/` — `WorkerManager` for CPU-bound jobs.

### Path aliases (package.json `imports`)

`#core/*`, `#modules/*`, `#database/*`, `#utilities/*`, `#workers/*`, `#root/*` (= `src/*`), and the `#lib/*` aliases: `#lib/commands.js`, `#lib/env.js`, `#lib/permissions.js`, `#lib/rabbit.js`, `#lib/guild-transaction.js`, `#lib/module-check.js`, `#lib/types.js`, `#lib/module-system.js`. Always import via these, never deep relative paths across layers. Note the `.js` suffix on specifiers even though sources are `.ts`.

### Module system

Each feature lives in `src/modules/<name>/` with an `index.ts` exporting a class decorated with `@EmberModule({ name, displayName, emoji, version, description, configFields?, dependencies?, conflicts?, isCore? })`. `ModuleStore` discovers modules by walking for `index.ts` files that export module `meta`, applies conflicts, topo-sorts by `dependencies`, then registers each module dir as a Sapphire path so its sub-stores load.

Sub-store directories inside a module (each optional):

- `commands/` — `EmberCommand` / `EmberSubcommand` pieces
- `listeners/` — Sapphire `Listener` pieces
- `interaction-handlers/` — buttons / selects / modals
- `services/` — `Service` pieces (singletons, see below)
- **`scheduled-tasks/`** — BullMQ `ScheduledTask` pieces. **The directory MUST be named `scheduled-tasks/`** (the `ScheduledTaskStore`'s name). A dir named `tasks/` is silently never scanned — `StoreRegistry.registerPath(dir)` appends each store's `.name` to the path. Same rule for `src/scheduled-tasks/` at the root.
- `data.ts` / `keys.ts` / `lib/` / `ui/` — plain helpers, not pieces.

**Zero cross-module imports.** Modules never import from sibling modules. Shared logic goes in `src/core/` or `src/utilities/`. Modules can be globally enabled/disabled (DB-backed, cluster-synced via `InvalidationBus`); the `ModuleEnabled` precondition is auto-attached to every command owned by a module so disabling a module gates its commands.

Per-user data cleanup: override `deleteUserData(userId, requester)` on the module class — it is invoked by the GDPR deletion flow (`src/core/lib/gdpr.ts`).

### Services

Extend `Service` (`#core/module-system/Service.js`); they expose `this.logger`, `this.db`, `this.redis`. Decorate with `@ApplyOptions<Piece.Options>({ name: "<svc>" })` and retrieve with `container.stores.get("services").get("<svc>")`. Services are the place for stateful/singleton logic (e.g. `FilterService` per-guild matchers, `TempVcService`).

### Permissions

`PermissionLevel` (`#lib/permissions.js`): `USER(0) < MOD(5) < ADMIN(7) < GUILD_OWNER(8) < BOT_OWNER(10)`. Set `permissionLevel` on a command's options and `EmberCommand` auto-appends the matching precondition (`Moderator` / `Administrator` / `GuildOwner` / `BotOwner`) and maps it to a Discord `defaultMemberPermissions`. Per-command, per-guild allow/deny overrides (user/role/channel/category/everyone) are enforced by the `PermissionOverrides` precondition.

### Config

**Zod-first.** Declare a single `configSchema: cfg.object({ ... })` in the module meta, building each field with the `cfg.*` helpers from `#core/module-system/Module.js` (`cfg.boolean / number / string / enum / channel / role / user`). The schema is the source of truth: the flat `ConfigField[]` the `/config` panel and dashboard RPC consume is **derived** from it (`fieldsFromSchema`, run by the `EmberModule` decorator) — never hand-author `configFields`. `/config` reads/writes via `ConfigService`, which `coerce()`s the raw string to the field type, then **validates the coerced value against the schema**, and stores JSON. **`STRING` fields are stored verbatim**; for comma-separated values pass `cfg.string({ ..., list: true })` and read them as `string[]` via `ConfigService.getConfigList` (the one shared `parseConfigList` transform) — never split inline. Register a cache-invalidation/reload hook with `container.configChangeHooks.set("<module>:<key>", fn)` instead of patching `ConfigService`. Per-scope overrides (user > channel > role > category > guild) via `ConfigService.getConfig(..., ctx)`.

### Data & cache

- Use **`container.db`** (`DatabaseService`) for all persistence in features — never call `container.prisma` directly from a module. KV helpers: `getModuleData`/`setModuleData` (keyed `guildId+module+targetId+key`); config: `getModuleConfig`/`setModuleConfig`.
- All Redis keys come from **`RedisKeys`** in `src/database/redis.ts`; never hard-code a key string. TTLs live in `RedisTTL`.
- Cache-aside reads go through `DatabaseService.getOrSet`. Cache busts go through `InvalidationBus` (`#invalidate`) so peer processes drop their copies too — never `redis.del` a shared cache key directly.

### Background work — two distinct systems

1. **Scheduled tasks** (BullMQ, Redis DB 1): delayed / exact-time / repeated jobs that must survive restarts. Define a `ScheduledTask` piece in `scheduled-tasks/`, register its payload type in `EmberScheduledTasks` (`src/core/types/common.ts`), schedule with `container.tasks.create(...)` using a stable `customJobOptions.jobId` for idempotency. Re-arm outstanding jobs on module load if needed (see `ModModule.reconcileExpiryJobs`). For jobs that may come due during downtime, control whether they fire-on-boot or are dropped via the `catchUp` policy: extend the payload with `CatchUpMeta` and call `shouldRunNow()` at the top of `run` (`src/core/lib/scheduled-tasks.ts`). CPU-bound work is offloaded directly to `WorkerManager` (worker threads), called by the feature that needs it — not via a broker.
2. **RabbitMQ events & RPC** (`#lib/rabbit.js`): cross-process **fanout events** (`publishEvent`/`onEvent` on `ember.events`) and the request/response **RPC bridge** to the web dashboard (`registerRpcHandler`, gated by `isDashboardEnabled`). There is **no fire-and-forget job queue** — it was removed; use system 1 for background work.

### Observability (`@ember/observability`)

Cross-service telemetry primitives — zero discord.js deps. App entrypoints call `bootstrapTelemetry("<service>")` from `apps/<svc>/src/telemetry.ts` **before any other import** (ESM hoisting: tracing must register before http/pg/ioredis/amqplib load). Thin apps (`gateway`/`scheduler`/`api`) just set `SERVICE_NAME` in `service-name.ts` and re-import `@ember/worker/main`.

- **Logger**: `PinoSapphireLogger` adapter (set on the Sapphire client). `createPinoLogger` injects `correlationId`/`traceId`/`spanId`/`guildId`/`userId` from the AsyncLocalStorage context. `LOG_LEVEL`, `LOG_FORMAT=json|pretty`.
- **Tracing**: `startTracing()` (gated on `OTEL_ENABLED`) registers a `NodeTracerProvider` + W3C propagator + auto-instrumentations. `withSpan(name, fn, options)` for manual spans. Command base class (`EmberCommand`/`EmberSubcommand`) wraps `chatInputRun`/`messageRun`/`contextMenuRun` so each invocation is one trace with child DB/Redis/HTTP spans nested. RabbitMQ `publishEvent` stamps `traceparent` on the envelope; consumers + `dispatchRpc` continue the trace.
- **Metrics**: prom-client registry, `/metrics` on `METRICS_PORT` (default `9090`). `commandsTotal{command,type,status}`, `commandDuration{command,type}` (RED); `busEventsPublished/Consumed{event}`, `queueDepth{queue}`, `shardLatency{shard}`/`shardStatus{shard}`/`guildCount`, `rest429Total{route,method,global}`, `cacheHits/Misses{cache}`, `pgPoolSize/Used/Waiting`. **Don't hand-create new metrics in modules** — add to `packages/observability/src/metrics.ts` so labels stay consistent.
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
| Safe JSON parse (returns null on error) | `tryParseJSON<T>(str)` |
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

> **PaginatedMessage note**: This class is embed-centric. Ember uses ContainerBuilder (v2 components)
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

All commands extend `EmberCommand` (not raw `Command`) or `EmberSubcommand`.
Every `registerApplicationCommands` builder must call:
```ts
.setDefaultMemberPermissions(this.defaultMemberPermissions ?? null)
.setContexts(...this.contexts)
.setIntegrationTypes(this.integrationTypes)
```

## Card system

All replies use `makeInfoCard`, `makeSuccessCard`, `makeErrorCard`, `makeWarningCard`, `makeListCard`
from `src/utilities/cards.ts`. These return `CardReply` (ContainerBuilder + `IsComponentsV2` flag).
Never construct raw embeds for user-facing responses.

## Pagination pattern

For paginated lists, use `chunk(lines, N)` from `@sapphire/utilities` to split into pages.
Add `{ footer: "Page X/Y • N total" }` to the card options. For interactive multi-page navigation,
follow the button handler pattern in `src/modules/afk/interaction-handlers/mentions.ts`.
