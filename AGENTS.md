# Lumi-TS Architecture & Guidelines

> [!IMPORTANT]
> This document serves as the absolute source of truth for developing the Lumi-TS codebase. AI coding assistants (like Claude) and human developers **must** adhere to these guidelines without exception.

## 📚 Table of Contents
1. [Tech Stack](#-tech-stack)
2. [Project Architecture](#-project-architecture)
3. [Module System](#-module-system)
4. [Data & State Management](#-data--state-management)
5. [Background Work](#-background-work)
6. [Observability](#-observability)
7. [Development Standards](#-development-standards)
8. [Library Reference](#-library-reference)

---

## 🛠️ Tech Stack

- **Runtime**: [Bun](https://bun.sh)
- **Framework**: Sapphire v5 (`@sapphire/framework`, `@sapphire/plugin-*`)
- **Discord**: discord.js v14 + `@discordjs/builders` + `@discordjs/formatters`
- **Database**: Prisma + PostgreSQL (pg adapter), ioredis
- **Messaging**: RabbitMQ (amqplib) + BullMQ (`@sapphire/plugin-scheduled-tasks`, Redis-backed)
- **i18n**: `@sapphire/plugin-i18next` (per-guild locale, typed keys)
- **Validation**: `@sapphire/shapeshift`

---

## 🏗️ Project Architecture

### Layout

Lumi-TS operates as a **Monorepo** using Bun workspaces: 
- `packages/*` (`@lumi/core`, `@lumi/event-bus`, `@lumi/observability`, `@lumi/contracts`, `@lumi/sharding`, `@lumi/sdk`)
- `apps/*` (`@lumi/dashboard`, `@lumi/gateway`, `@lumi/scheduler`, `@lumi/worker`)

The bot itself resides in **`@lumi/core`** (`packages/core/`). Every `src/…` path mentioned below is rooted at `packages/core/src/`.
`apps/*` are thin deployment entrypoints. `packages/*` are the libraries they compose. 

> [!WARNING]
> Cross-package imports must use the `@lumi/*` names. **Never** use relative paths between packages.

### Core Directories (`packages/core/src/`)
- `lib/` — Framework glue. Holds base classes, the module system, DB/Redis layers, RabbitMQ bridge, utilities, and Prisma setup.
- `modules/` — Feature modules. The root for `ModuleStore`.
- `languages/` — Translations for i18n.
- `scheduled-tasks/` — BullMQ `ScheduledTask` definitions.

### Path Aliases
Within `@lumi/core`, use the following `imports` defined in `package.json`:
`#lib/*`, `#modules/*`, `#root/*` (maps to `packages/core/src/*`).
Library aliases: `#lib/commands.js`, `#lib/env.js`, `#lib/permissions.js`, `#lib/rabbit.js`, `#lib/guild-transaction.js`, `#lib/module-check.js`, `#lib/types.js`, `#lib/module-system.js`, `#lib/schedule-task.js`, `#lib/scheduler-bus.js`.

> [!TIP]
> Always append `.js` to specifiers when importing via aliases, even though the source files are `.ts`.

### Runtime Roles & Scale-out
The `@lumi/core` build runs in one of four roles selected by `LUMI_ROLE`:
1. `monolith` (default) — Full WS, BullMQ, and module work in one process.
2. `gateway` — Holds Discord WebSocket, publishes raw dispatch packets to the event bus.
3. `worker` — No WS; consumes raw packets off the bus, runs command/module work.
4. `scheduler` — Owns the BullMQ Queue + Worker, re-publishes task effects.

> `TRANSPORT` selects the event bus backend (`inproc`, `streams`, `nats`).

---

## 🧩 Module System

Each feature lives in `src/modules/<name>/`. The `index.ts` exports a class decorated with `@DefineModule`.

### Sub-store Directories
- `commands/` — Extend `BaseCommand` or `BaseSubcommand`.
- `listeners/` — Extend `ModuleListener` (guild resolution built-in) or `GuildMessageListener`.
- `interaction-handlers/` — Buttons, selects, modals.
- `services/` — Singletons extending `Service`.
- **`scheduled-tasks/`** — BullMQ `ScheduledTask` pieces. (Must be exactly named).

> [!CAUTION]
> **Zero cross-module imports.** Modules must never import from sibling modules. Shared logic goes in `src/lib/` or `src/lib/utilities/`.

### Services
Extend `Service` (`#lib/module-system/Service.js`). They expose `this.logger`, `this.db`, `this.redis`. 
Always retrieve with `getService("<svc>")` or `tryGetService("<svc>")`.

### Permissions
Permission levels are defined as: `USER(0) < MOD(5) < ADMIN(7) < GUILD_OWNER(8) < BOT_OWNER(10)`. Set `permissionLevel` on a command's options, and `BaseCommand` will auto-append the matching precondition.

---

## 💾 Data & State Management

### Database & Cache
- Use **`container.db`** (`DatabaseService`) for all persistence. **Never** call `container.prisma` directly from a module.
- Redis keys must come from `RedisKeys` in `src/lib/database/redis.ts`.
- Cache busts go through `InvalidationBus`. **Never** `redis.del` a shared cache key directly.
- **`container.entityCache`**: This is provisioned-ahead infra for a future `GuildManager: 0` step. Do not migrate call sites onto it until that step is taken.

### Config
Config uses a **Shapeshift-first** approach. Declare a single `configSchema` in the module meta using `cfg.*` helpers. The flat `ConfigField[]` is derived from this schema. Use `ConfigService.getConfigList` to read lists. Register a cache-invalidation hook with `container.configChangeHooks.set("<module>:<key>", fn)` instead of patching `ConfigService`.

---

## ⚙️ Background Work

1. **Scheduled Tasks** (BullMQ): Extend `RelayTask<"name">`. The directory must be `scheduled-tasks/`.
2. **RabbitMQ Events & RPC**: Cross-process fanout events (`publishEvent`/`onEvent`) and RPC bridge (`registerRpcHandler`). There is no fire-and-forget job queue here; use BullMQ for that.

---

## 📊 Observability (`@lumi/observability`)

- **Logger**: Uses `PinoSapphireLogger`.
- **Tracing**: Managed via `startTracing()`. Do not enable `OTEL_ENABLED` and `SENTRY_ENABLED` together.
- **Metrics**: Prom-client registry on `METRICS_PORT` (default 9090). Do not hand-create new metrics inside modules; add them to `packages/observability/src/metrics.ts`.

---

## 💻 Development Standards

### Commands & UI
- All commands must extend `BaseCommand` or `BaseSubcommand`.
- Do not manually apply `defaultMemberPermissions`, `contexts`, or `integrationTypes` in the builder unless intentionally overriding.
- **Card System**: Never construct raw embeds. Use `makeInfoCard`, `makeSuccessCard`, `makeErrorCard`, `makeWarningCard`, `makeListCard` from `src/lib/utilities/cards.ts`. Reply using `sendSuccess`, `sendError`, etc.
- **Pagination**: Use `chunk(lines, N)` from `@sapphire/utilities`. Do not use `PaginatedMessage`.

### i18n
- Translations are in `src/languages/<locale>/<namespace>.json`.
- Shipping locales: `en-US`, `de`, `es-ES`, `fr`. 
- Get a translator in commands with `await this.fetchT(interaction)`.

---

## 📚 Library Reference

Do not hand-roll functionality that already exists in our integrated libraries.

### `@discordjs/formatters`
| Use case | Helper |
|---|---|
| Relative timestamp `<t:…:R>` | `time(date, TimestampStyles.RelativeTime)` |
| Short time `<t:…:T>` | `time(date, TimestampStyles.ShortTime)` |
| User mention `<@id>` | `userMention(id)` |
| Channel mention `<#id>` | `channelMention(id)` |
| Role mention `<@&id>` | `roleMention(id)` |
| Escape markdown | `escapeMarkdown(str)` |

### `@sapphire/utilities`
| Use case | Helper |
|---|---|
| Truncate to N chars | `cutText(str, n)` |
| Null / undefined check | `isNullish(v)` |
| Null / undefined / empty check | `isNullishOrEmpty(v)` |
| Type-safe `filter(Boolean)` | `.filter(filterNullish)` |
| Safe JSON parse | `tryParseJSON(str)` |
| `charAt(0).toUpperCase() + …` | `capitalizeFirstLetter(str)` |
| `str.charAt(0).toUpper + …Lower` | `toTitleCase(str)` |
| Split array into pages | `chunk(arr, size)` |
| Escape regex metacharacters | `regExpEsc(str)` |
| Awaitable union type | `Awaitable<T>` |
| Random element | `pickRandom(arr)` |
| Deep clone | `deepClone(obj)` |

### Other Specifics
- **Fetch**: Use `@sapphire/fetch` instead of raw `fetch()`.
- **Timing**: Use `@sapphire/stopwatch` instead of `performance.now()`.
- **Durations**: Use `@sapphire/time-utilities` or `container.utilities.time.humanizeDelta()`.

> [!WARNING]
> **Strict Anti-Patterns**:
> - Raw `<@id>` strings → use formatters
> - `.filter(Boolean)` on typed arrays → use `.filter(filterNullish)`
> - `JSON.parse` in try/catch → use `tryParseJSON`
