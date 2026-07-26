# 🤖 Lumi AI Agent Operating Specification & Monorepo Architecture Blueprint

> [!IMPORTANT]
> This document is the **absolute operational specification** for AI coding agents and human developers working within the Lumi repository. Autonomous and semi-autonomous AI agents **must** adhere to these protocols, safety constraints, coding standards, and verification requirements without exception.

---

## 📖 Table of Contents

1. [AI Agent Operational Protocols & Safety Guardrails](#1-ai-agent-operational-protocols--safety-guardrails)
2. [Monorepo Architecture & Path Resolution](#2-monorepo-architecture--path-resolution)
3. [Tech Stack & Approved Libraries](#3-tech-stack--approved-libraries)
4. [Module System & Component Laws](#4-module-system--component-laws)
5. [Data, State & Config Management](#5-data-state--config-management)
6. [Background Processing & Event Bus](#6-background-processing--event-bus)
7. [Observability & Telemetry](#7-observability--telemetry)
8. [UI Card System & i18n Rules](#8-ui-card-system--i18n-rules)
9. [Verification Command Matrix & Anti-Pattern Index](#9-verification-command-matrix--anti-pattern-index)

---

## 1. 🤖 AI Agent Operational Protocols & Safety Guardrails

### 1.1 Phased Task Execution Lifecycle
Every AI agent task must progress through 5 distinct operational phases in order:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       AI AGENT TASK EXECUTION LIFECYCLE                     │
├───────────────┬─────────────────────────────────────────────────────────────┤
│ Phase 1       │ Exploration & Discovery (Read-Only)                         │
│               │ Inspect code, locate exact lines, read briefing/progress.  │
├───────────────┼─────────────────────────────────────────────────────────────┤
│ Phase 2       │ Architectural Alignment                                     │
│               │ Verify monorepo boundaries, module rules & schema contracts.│
├───────────────┼─────────────────────────────────────────────────────────────┤
│ Phase 3       │ Focused Minimal Implementation                              │
│               │ Make minimal, contiguous edits. Preserve existing style.   │
├───────────────┼─────────────────────────────────────────────────────────────┤
│ Phase 4       │ Mandatory Self-Verification                                 │
│               │ Execute build, typecheck, lint, and test suites.            │
├───────────────┼─────────────────────────────────────────────────────────────┤
│ Phase 5       │ Structured Handoff & Documentation                          │
│               │ Produce 5-Component Handoff Report in workspace directory.  │
└───────────────┴─────────────────────────────────────────────────────────────┘
```

### 1.2 Context Window & Information Retrieval Optimization
To maintain context window efficiency and prevent token exhaustion:
- **Tool Hierarchy**: Use low-overhead search tools first.
  1. `grep_search` — Exact string or regex pattern search.
  2. `find_by_name` — Target filename or pattern search.
  3. `view_file` — Targeted inspection using explicit `StartLine` and `EndLine`.
- **Line & Slice Discipline**: Never dump large files (>800 lines) into context without line slicing.
- **Diff Minimization**: Make surgical, minimal-change edits. Blanket file auto-formatting or wholesale file replacements are strictly prohibited.

### 1.3 Tool Safety Constraints & Security Guardrails
AI agents must strictly respect safety constraints during tool execution:

- ❌ **Forbidden Bash Operations**:
  - Destructive filesystem commands: `rm -rf /`, `rm -rf .git`, unapproved mass deletion.
  - Raw secret exposure: Printing contents of `.env` or logging API keys/tokens to output.
  - Production database mutation: Executing `prisma db push` or `prisma migrate reset` against production databases (`NODE_ENV=production`).
- ⚡ **Prerequisite Execution Law**:
  - Always run `bun run db:generate` (`prisma generate`) before executing `bun run typecheck` whenever Prisma schema or database models are modified.
  - Always run `bun run modules:manifest` after creating or modifying `@DefineModule` metadata.
- 🐚 **Nix Shell Execution**:
  - If running in an environment where `bun` is not in default PATH, invoke commands using `nix-shell -p bun nodejs --run "<command>"`.

### 1.4 Multi-Agent Workspace Isolation & Handoff Standard
- **Workspace Isolation**: Each agent operates strictly within its designated working directory under `.agents/<agent_id>/`. Agents must **never** create temporary scratch files outside their assigned `.agents` subfolder.
- **5-Component Handoff Protocol**: All handoff reports (`handoff.md`) must contain the following 5 sections:
  1. **Observation**: Verbatim file paths, line numbers, exact errors, and tool output quotes.
  2. **Logic Chain**: Step-by-step reasoning connecting observations to conclusions.
  3. **Caveats**: Scope limits, unverified edge cases, assumptions made.
  4. **Conclusion**: Clear, actionable assessment supported by logic.
  5. **Verification Method**: Exact commands and file paths to independently verify work.

### 1.5 State Recovery & Liveness Protocol
- **Liveness Heartbeat**: Update `.agents/<agent_id>/progress.md` after completing each meaningful task step. Include a `Last visited: [timestamp]` header.
- **Persistent Working Memory**: Maintain `.agents/<agent_id>/BRIEFING.md` (<100 lines index). Sections marked `## 🔒 My Identity` and `## 🔒 Key Constraints` are **immutable and append-only**.

---

## 2. 🏗️ Monorepo Architecture & Path Resolution

### 2.1 Workspace Structure
Lumi is structured as a Bun workspace monorepo:
- **`apps/*`**: Thin entrypoint applications (`@lumi/worker`, `@lumi/gateway`, `@lumi/scheduler`, `@lumi/dashboard`).
- **`packages/*`**: Shared core libraries (`@lumi/core`, `@lumi/event-bus`, `@lumi/observability`, `@lumi/sharding`, `@lumi/contracts`, `@lumi/sdk`, `@lumi/eslint-config`, `@lumi/typescript-config`).

> [!WARNING]
> **Cross-Package Import Law**: Cross-package imports MUST use `@lumi/*` package specifiers. Never use relative paths (e.g. `../../packages/core`) across package boundaries.

### 2.2 Complete Path Alias Specifier Reference
Within `@lumi/core` (and symlinked third-party modules), imports are mapped via `package.json`:

| Import Alias | Target Resolution | Description |
| :--- | :--- | :--- |
| `#lib/*.js` | `./packages/core/src/lib/*.ts` | Core library modules and framework glue |
| `#database/*.js` | `./packages/core/src/lib/database/*.ts` | Database service, Prisma, Redis keys, cache |
| `#utilities/*.js` | `./packages/core/src/lib/utilities/*.ts` | Cards, formatters, time helpers, utilities |
| `#core/lib/*.js` | `./packages/core/src/lib/*.ts` | Alias for core library imports |
| `#core/module-system/*.js`| `./packages/core/src/lib/module-system/*.ts` | Module store, Service, listener bases |
| `#root/*.js` | `./packages/core/src/*.ts` | Root source directory |
| `#modules/*.js` | `./packages/core/src/modules/*.ts` | Module sub-stores and feature code |

> [!IMPORTANT]
> **Mandatory `.js` Extension Law**: Specifiers using import aliases MUST append `.js` (e.g. `import { Service } from '#core/module-system/Service.js'`), even though source files are written in `.ts`.

### 2.3 3rd-Party Addon Architecture & Symlink Resolution
Third-party downloaded modules reside in `data/3rd-party-modules/` and are symlinked into `packages/core/src/modules/`.

Because Bun resolves symlinks to their realpath (`data/3rd-party-modules/<addon>`), the root `package.json` contains a `"comment:imports"` map mirroring `packages/core/package.json`. This guarantees that `#lib/*`, `#database/*`, and `#utilities/*` import aliases resolve seamlessly from third-party addon directories without breaking module encapsulation.

### 2.4 Runtime Roles (`LUMI_ROLE`) & Transports (`TRANSPORT`)
`LUMI_ROLE` controls process behavior:
- `monolith` (default): Monolithic worker process running WebSockets, commands, and scheduled tasks in one process.
- `gateway`: Dedicated Discord WebSocket receiver publishing raw events onto the transport bus.
- `worker`: WebSocket-less event consumer handling command, listener, and module execution.
- `scheduler`: Leader-locked process managing BullMQ queues and delayed jobs.

`TRANSPORT` selects the event bus transport backend (`inproc`, `streams` [Redis], `nats` [JetStream]).

---

## 3. 🛠️ Tech Stack & Approved Libraries

### 3.1 Stack Summary
- **Runtime**: Bun 1.3+
- **Framework**: Sapphire Framework v5 (`@sapphire/framework`, `@sapphire/plugin-*`)
- **Discord**: Discord.js v14 + `@discordjs/builders` + `@discordjs/formatters`
- **Database**: PostgreSQL 17 + Prisma ORM (`@prisma/client`) + PgBouncer
- **Cache & Queues**: Redis 7 (ioredis) + BullMQ (`@sapphire/plugin-scheduled-tasks`)
- **Messaging**: RabbitMQ (`amqplib`) RPC bridge + Event Bus
- **Validation & i18n**: `@sapphire/shapeshift` + `@sapphire/plugin-i18next`

### 3.2 Approved Helper Libraries

#### `@discordjs/formatters` Reference Table
| Use Case | Recommended Helper Function |
| :--- | :--- |
| Relative timestamp (`<t:…:R>`) | `time(date, TimestampStyles.RelativeTime)` |
| Short time (`<t:…:T>`) | `time(date, TimestampStyles.ShortTime)` |
| User mention (`<@id>`) | `userMention(id)` |
| Channel mention (`<#id>`) | `channelMention(id)` |
| Role mention (`<@&id>`) | `roleMention(id)` |
| Escape markdown | `escapeMarkdown(str)` |

#### `@sapphire/utilities` Reference Table
| Use Case | Approved Helper Function | Anti-Pattern to Avoid |
| :--- | :--- | :--- |
| Truncate string to N chars | `cutText(str, n)` | Manual `.slice(0, n) + '...'` |
| Check null / undefined | `isNullish(v)` | `v === null \|\| v === undefined` |
| Check null / empty | `isNullishOrEmpty(v)` | Manual string/array length check |
| Type-safe array filter | `.filter(filterNullish)` | ❌ `.filter(Boolean)` on typed arrays |
| Safe JSON parsing | `tryParseJSON(str)` | ❌ `JSON.parse` inside try/catch |
| Title case capitalization | `toTitleCase(str)` | Manual regex or `.toUpperCase()` chaining |
| Array pagination chunking | `chunk(arr, size)` | ❌ `PaginatedMessage` or custom loops |
| Escape regex metacharacters | `regExpEsc(str)` | Manual string replacements |
| Safe object cloning | `deepClone(obj)` | `JSON.parse(JSON.stringify(obj))` |

#### Utilities & Timers
- **HTTP Fetch**: Use `@sapphire/fetch` instead of global `fetch()`.
- **Performance Stopwatch**: Use `@sapphire/stopwatch` instead of `performance.now()`.
- **Duration Formatting**: Use `container.utilities.time.humanizeDelta()`.

---

## 4. 🧩 Module System & Component Laws

### 4.1 Module Structure & `@DefineModule` Decorator
Feature modules live in `packages/core/src/modules/<module_name>/`. The entrypoint `index.ts` exports a module class decorated with `@DefineModule`:

```typescript
import { Module, DefineModule } from '#core/module-system/Module.js';

@DefineModule({
  id: 'my_module',
  name: 'My Feature Module',
  description: 'Module description goes here',
  defaultEnabled: true,
  configSchema: myConfigSchema
})
export class MyModule extends Module {}
```

### 4.2 Module Sub-store Directories
- `commands/` — Extend `BaseCommand` or `BaseSubcommand`.
- `listeners/` — Extend `ModuleListener` or `GuildMessageListener`.
- `interaction-handlers/` — Extend Sapphire `InteractionHandler` (buttons, select menus, modals).
- `services/` — Extend `Service` singleton class.
- **`scheduled-tasks/`** — Must be named **`scheduled-tasks/`** exactly; extend `RelayTask`.

> [!CAUTION]
> **Zero Cross-Module Import Law**: Feature modules must **NEVER** import code directly from sibling modules (e.g. `import { foo } from '../other_module/service.js'` is strictly forbidden). Shared functionality must be placed in `#lib/*`, `#database/*`, or `#utilities/*`.

### 4.3 Services & Permission Hierarchy
- **Services**: Singletons extending `Service` (`#core/module-system/Service.js`). Access via `getService("<name>")` or `tryGetService("<name>")`.
- **Permissions Tier Hierarchy**:
  `USER(0) < MOD(5) < ADMIN(7) < GUILD_OWNER(8) < BOT_OWNER(10)`. Set `permissionLevel` in command options.

---

## 5. 💾 Data, State & Config Management

### 5.1 Database Access (`container.db`)
- **Mandate**: All database queries must go through **`container.db`** (`DatabaseService`).
- ❌ **Absolute Ban**: Modules must **NEVER** access `container.prisma` directly.

### 5.2 Redis Namespacing & InvalidationBus
- All Redis key names must be registered in `RedisKeys` (`#database/redis.js`).
- Cache invalidations **must** pass through `InvalidationBus`. Never call `redis.del` directly on shared keys.

### 5.3 Module Configuration & Schema Validation
- Configuration uses `@sapphire/shapeshift` (`cfg.*` helpers).
- Read module settings using `ConfigService.getConfigList`.
- Register cache invalidation hooks with `container.configChangeHooks.set("<module>:<key>", fn)`.

---

## 6. ⚙️ Background Processing & Event Bus

1. **Scheduled Tasks (BullMQ)**: Place task definitions in `src/modules/<name>/scheduled-tasks/` extending `RelayTask`.
2. **RabbitMQ Event Bus & RPC**:
   - Inter-process events: `publishEvent` and `onEvent`.
   - Web RPC Bridge: Register handlers via `registerRpcHandler` for web panel communication (`apps/dashboard`).

---

## 7. 📊 Observability & Telemetry

- **Logging**: Use `this.logger` (backed by `PinoSapphireLogger`).
- **OpenTelemetry**: Enabled via `OTEL_ENABLED=true`. Note: `OTEL_ENABLED` and `SENTRY_ENABLED` are mutually exclusive.
- **Metrics Exporter**: Prometheus registry exposed on `METRICS_PORT` (`:9090`). Custom metrics **must** be registered in `packages/observability/src/metrics.ts`.

---

## 8. 💻 UI Card System & i18n Rules

### 8.1 Card System Utilities (`#utilities/cards.js`)
Lumi enforces a consistent visual design language across all Discord replies.

- ❌ **Forbidden**: Constructing raw `EmbedBuilder` instances inside commands.
- ✅ **Mandatory**: Use Card System helpers: `makeInfoCard`, `makeSuccessCard`, `makeErrorCard`, `makeWarningCard`, `makeListCard`.
- Reply using interaction helpers: `sendSuccess(interaction, message)`, `sendError(interaction, message)`.

### 8.2 Pagination & i18n
- **Pagination**: Use `chunk(array, pageSize)` from `@sapphire/utilities`. Do not use `PaginatedMessage`.
- **Localization**: Translation files reside in `packages/core/src/languages/<locale>/<namespace>.json`. Supported locales: `en-US`, `de`, `es-ES`, `fr`. Fetch translators via `await this.fetchT(interaction)`.

---

## 9. ✅ Verification Command Matrix & Anti-Pattern Index

### 9.1 Verification Command Matrix

| Change Scope | Required Verification Command(s) |
| :--- | :--- |
| **Prisma Schema Changes** | `bun run db:generate` (or `nix-shell -p bun nodejs --run "bun run db:generate"`) |
| **Module Metadata / `@DefineModule`** | `bun run modules:manifest` |
| **TypeScript Code & Types** | `bun run typecheck` |
| **Code Style & Linting** | `bun run lint` |
| **Unit & Integration Tests** | `bun run test` |
| **End-to-End Tests** | `bun run test:e2e` |
| **System Resilience & Chaos** | `bun run verify:resilience` |
| **Third-Party Addon Package** | `bun run validate <path/to/addon>` |

### 9.2 Anti-Pattern Index

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           STRICT ANTI-PATTERN INDEX                         │
├────────────────────────────┬────────────────────────────────────────────────┤
│ Anti-Pattern               │ Rule Violation & Correct Alternative           │
├────────────────────────────┼────────────────────────────────────────────────┤
│ Raw Embeds                 │ ❌ Banned. Use Card System helpers from cards.ts│
│ Cross-Module Imports       │ ❌ Banned. Move shared code to #lib/           │
│ Direct container.prisma    │ ❌ Banned. Use container.db (DatabaseService)  │
│ Direct redis.del           │ ❌ Banned. Use InvalidationBus                 │
│ Raw <@ID> string formatting│ ❌ Banned. Use userMention(id) from formatters │
│ .filter(Boolean) on arrays │ ❌ Banned. Use .filter(filterNullish)          │
│ JSON.parse in try/catch    │ ❌ Banned. Use tryParseJSON(str)               │
│ Context Window Dumping     │ ❌ Banned. Use grep_search and line slicing   │
│ Unverified Handoffs        │ ❌ Banned. Provide 5-Component Handoff Report │
└────────────────────────────┴────────────────────────────────────────────────┘
```
