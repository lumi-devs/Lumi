# 🤖 Lumi AI Agent Operating Specification & Monorepo Architecture Blueprint

> [!IMPORTANT]
> This document is the **absolute operational specification** for AI coding agents and human developers working within the Lumi repository. Autonomous and semi-autonomous AI agents **must** adhere to these protocols, safety constraints, coding standards, and verification requirements without exception.

---

## 📖 Table of Contents

1. [Phased Task Execution Lifecycle, Context Window Rules & Safety Guardrails](#1-phased-task-execution-lifecycle-context-window-rules--safety-guardrails)
2. [Changeset Creation & Release Workflow Protocols](#2-changeset-creation--release-workflow-protocols)
3. [Monorepo Architecture & Path Resolution Spec](#3-monorepo-architecture--path-resolution-spec)
4. [Tech Stack & Approved Helper Libraries](#4-tech-stack--approved-helper-libraries)
5. [Module System & Component Laws](#5-module-system--component-laws)
6. [Database, Seeding & Storage Management](#6-database-seeding--storage-management)
7. [Background Processing, Event Bus & RabbitMQ RPC Bridge](#7-background-processing-event-bus--rabbitmq-rpc-bridge)
8. [Git, PR & CI Automation Protocols](#8-git-pr--ci-automation-protocols)
9. [UI Card System & i18n Rules](#9-ui-card-system--i18n-rules)
10. [Observability & Telemetry](#10-observability--telemetry)
11. [Verification Command Matrix & Anti-Pattern Index](#11-verification-command-matrix--anti-pattern-index)

---

## 1. 🤖 Phased Task Execution Lifecycle, Context Window Rules & Safety Guardrails

To ensure predictable, reliable, and transparent agent operations, all Lumi agents must strictly adhere to a standardized 5-Phase Task Execution Lifecycle and utilize a structured 5-Component Handoff Report Protocol.

### 1.1 5-Phase Task Execution Lifecycle

All tasks, regardless of size, must proceed through the following 5 chronological phases:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       AI AGENT TASK EXECUTION LIFECYCLE                     │
├───────────────┬─────────────────────────────────────────────────────────────┤
│ Phase 1       │ Ingestion & Briefing Analysis (Read-Only)                   │
│               │ Inspect code, locate exact lines, read briefing/progress.  │
├───────────────┼─────────────────────────────────────────────────────────────┤
│ Phase 2       │ Exploration & Architectural Alignment                       │
│               │ Verify monorepo boundaries, module rules & draft plan.      │
├───────────────┼─────────────────────────────────────────────────────────────┤
│ Phase 3       │ Focused Minimal Implementation                              │
│               │ Make minimal, contiguous edits. Preserve existing style.   │
├───────────────┼─────────────────────────────────────────────────────────────┤
│ Phase 4       │ Mandatory Self-Verification                                 │
│               │ Execute build, typecheck, lint, and test suites.            │
├───────────────┼─────────────────────────────────────────────────────────────┤
│ Phase 5       │ Handoff, Changeset & Documentation                          │
│               │ Produce Changeset (if code touched) & 5-Component Report.  │
└───────────────┴─────────────────────────────────────────────────────────────┘
```

1. **Phase 1: Ingestion & Briefing Analysis**
   - Read persistent working memory files (`BRIEFING.md` and `progress.md`) to establish full context and mission parameters.
2. **Phase 2: Exploration & Planning**
   - Investigate the codebase using `grep_search`, `find_by_name`, and targeted `view_file` calls. Draft an atomic implementation plan and update `progress.md`.
3. **Phase 3: Focused Minimal Implementation**
   - Mutate source code atomically. If modifying `packages/` or `apps/`, prepare a corresponding changeset (see Section 2).
4. **Phase 4: Mandatory Self-Verification**
   - Execute verification suites (`bun run typecheck`, `bun run lint`, `bun run test`). Resolve all introduced warnings or errors before committing.
5. **Phase 5: Handoff & Documentation**
   - Generate required Changesets (`bunx changeset`). Update `progress.md` and output the 5-Component Handoff Report.

### 1.2 Context Window & Information Retrieval Optimization

To maintain context window efficiency and prevent token exhaustion:
- **Tool Hierarchy**: Use low-overhead search tools first.
  1. `grep_search` - Exact string or regex pattern search.
  2. `find_by_name` - Target filename or pattern search.
  3. `view_file` - Targeted inspection using explicit `StartLine` and `EndLine`.
- **Line & Slice Discipline**: Never dump large files (>800 lines) into context without line slicing.
- **Diff Minimization**: Make surgical, minimal-change edits. Blanket file auto-formatting or wholesale file replacements are strictly prohibited.

### 1.3 Tool Safety Constraints & Security Guardrails

AI agents must strictly respect safety constraints during tool execution:
- ❌ **Forbidden Bash Operations**:
  - Destructive filesystem commands: `rm -rf /`, `rm -rf .git`, unapproved mass deletion.
  - Raw secret exposure: Printing contents of `.env` or logging API keys/tokens to output.
  - Production database mutation: Executing `prisma db push` or `prisma migrate reset` against production databases (`NODE_ENV=production`).
- ⚡ **Prerequisite Execution Law**: Run `bun run db:generate` before typechecking schema changes and `bun run modules:manifest` after modifying `@DefineModule` metadata.

### 1.4 Persistent Working Memory (`progress.md` & `BRIEFING.md`)

- **`BRIEFING.md`**: The Immutable Source of Truth containing core system architecture, constraints, and dependency rules.
- **`progress.md`**: The Mutable Scratchpad tracking immediate task queues, completed checklists, and blockers.

### 1.5 5-Component Handoff Report Protocol

All agent handoff reports must contain the following 5 sections:
1. **Observation**: Verbatim file paths, line numbers, exact errors, and tool output quotes.
2. **Logic Chain**: Step-by-step reasoning connecting observations to conclusions.
3. **Caveats**: Scope limits, unverified edge cases, assumptions made.
4. **Conclusion**: Clear, actionable assessment supported by logic.
5. **Verification Method**: Exact commands and file paths to independently verify work.

### 1.6 Anti-AI Code Slop Law

AI agents must NEVER write "AI code slop". Code submitted to Lumi must be clean, idiomatic, self-documenting TypeScript:

- ❌ **No Trivial Comments**: Banned comments explaining *what* code does (e.g. `// increment count`, `// return the user`, `// initialize variable`). Write self-documenting variable and function names. Only use comments for non-obvious *why* architecture decisions.
- ❌ **No Redundant `try-catch` Wrappers**: Never wrap non-throwing synchronous statements or simple object property lookups in defensive `try-catch` blocks that log and rethrow. Centralize error handling in framework handlers.
- ❌ **No AI Conversational Chatter in Source Files**: Never leave introductory AI text inside code comments (e.g. `// Here is the implementation of...`, `// Note: make sure to update...`).
- ❌ **No Re-invented Helpers**: Never re-implement utility functions already present in `@sapphire/utilities` (`isNullish`, `cutText`, `filterNullish`) or `#utilities/cards.js`.
- ❌ **No Over-Engineered Single-Use Abstractions**: Never create unnecessary factory classes, wrapper abstractions, or multi-level indirection for single-use functions.

### 1.7 TypeScript & Discord.js Anti-Slop Giveaways

The following 6 giveaways indicate low-quality AI-generated Discord.js/TypeScript code and are **strictly banned**:

1. ❌ **`as any` / `as unknown as X` Lazy Force-Casting**: Never force-cast to `any` to silence compiler errors. Use type guards (`instanceof`, `typeof`), `unknown`, or `@sapphire/shapeshift` schema validation.
2. ❌ **Raw `EmbedBuilder` Instantiations**: Never use `new EmbedBuilder()`. All Discord card UI MUST use `#utilities/cards.js` (`makeInfoCard`, `makeSuccessCard`, `replyError`).
3. ❌ **Hardcoded Mention Strings (`<@${id}>`, `<#${id}>`)**: Never write raw string interpolation for pings. Use `@discordjs/formatters` (`userMention()`, `roleMention()`, `channelMention()`).
4. ❌ **Loose Falsy `!x` Checks**: Never use loose `!x` on objects or booleans. Use `@sapphire/utilities` (`isNullish(x)`).
5. ❌ **Raw Ephemeral Bitfield Flag Magic (`MessageFlags.Ephemeral`)**: Never OR `MessageFlags.Ephemeral` manually in replies. Use `ephemeralCard()` or `replyError`.
6. ❌ **Redundant Local Try-Catch Swallowing**: Never wrap Discord interaction replies in local try-catches that swallow exceptions. Let Sapphire framework handle interaction lifecycle errors.

---

## 2. 📦 Changeset Creation & Release Workflow Protocols

Lumi utilizes a monorepo architecture leveraging Changesets (`@changesets/cli` + `@changesets/action`) for version management, automated changelog generation, and GitHub Release publishing.

### 2.1 Step-by-Step Changeset Release Pipeline

```
  ┌───────────────────────┐
  │  Step 1: Contributor  │ ──► Creates code edit in packages/ or apps/
  │  Runs bunx changeset  │     Generates .changeset/*.md file with version bump choice
  └───────────┬───────────┘
              │ PR Merged to main
  ┌───────────▼───────────┐
  │   Step 2: release.yml │ ──► Reads pending .changeset/*.md files
  │   Automated Action    │     Bumps version in package.json & CHANGELOG.md
  └───────────┬───────────┘     Opens automated "Version Packages" PR
              │ Maintainer Merges Version PR
  ┌───────────▼───────────┐
  │  Step 3: GitHub       │ ──► Cuts official GitHub Releases
  │  Release Published    │     Creates git version tags (e.g. v1.0.1)
  └───────────────────────┘     Publishes package releases to registry
```

- **Step 1: Contributor Creates a Change (`bunx changeset`)**
  When an AI agent or contributor edits code in `packages/` or `apps/`, run:
  ```bash
  bunx changeset
  ```
  Select the package(s) changed, select the semver bump type (`patch`, `minor`, `major`), and write a human-readable summary. This generates a file under `.changeset/*.md` to commit with the PR.

- **Step 2: PR Merged ➔ Automated "Version Packages" PR**
  When a PR merges into `main`, [`.github/workflows/release.yml`](file://.github/workflows/release.yml) executes `bunx @changesets/cli version`. It reads pending `.changeset/*.md` files, updates `package.json` versions and `CHANGELOG.md` files, deletes consumed changeset files, and opens (or updates) an automated PR titled **Version Packages**.

- **Step 3: Maintainer Merges Version PR ➔ Automated Release**
  When a maintainer merges the automated **Version Packages** PR into `main`, `@changesets/action` cuts official GitHub Releases, creates git version tags (e.g. `v1.0.1`), and publishes packages automatically.

### 2.2 Changeset Markdown Schema

Manually constructed changesets in `.changeset/` must use standard YAML frontmatter:

```markdown
---
"@lumi/core": patch
"@lumi/worker": patch
---

Detailed human-readable summary of the changes for CHANGELOG.md.
```

### 2.3 Semantic Versioning (Semver) Rules

- **`patch` (0.0.X)**: Bug fixes, internal refactoring, performance tweaks (backwards-compatible).
- **`minor` (0.X.0)**: New features or non-breaking public API additions.
- **`major` (X.0.0)**: Breaking API changes or major architectural redesigns.

### 2.4 Auto-Exemption Rules

Changesets are exempt for commits strictly modifying:
- Documentation files (`area:docs` / `docs-only` label, `docs/` directory, `*.md`).
- Workflow & CI files (`area:ci` label, `.github/workflows/`, `flake.nix`, `lefthook.yml`).

### 2.5 GitHub Actions Bot Capabilities & Automation Suite

The Lumi repository leverages a full GitHub Actions automation bot suite across 21 workflow triggers:
1. **ChatOps Slash Commands (`slash-commands.yml` & `comment.yml`)**:
   - `/format`: Automatically runs ESLint `--fix` on the PR code and pushes a clean format commit directly back to the contributor's PR branch.
   - `/bench`: Runs `bun run bench` inside GitHub Actions and posts a live micro-benchmark comment (ops/sec, P99 latency, RSS memory) matching pnpm standards.
   - `/retest`: Re-triggers failed CI jobs without needing manual workflow dispatch privileges.
2. **Automated PR Hygiene & Triage (`pr-comment-summary.yml`, `review.yml`, `size-label.yml`, `labeler.yml`)**:
   - Updates a sticky PR summary status comment with test coverage and lint results.
   - Minimizes/collapses outdated bot comments via GitHub GraphQL API.
   - Computes PR diff line sizes (`size:XS` to `size:XL`) and labels packages (`area:core`, `area:gateway`).
3. **Resilience & Chaos Testing (`resilience.yml`)**:
   - Runs simulated Redis Stream failures and network partitions (`bun scripts/verify-resilience.ts`) to ensure fault tolerance before code hits production.

---

## 3. 🏗️ Monorepo Architecture & Path Resolution Spec

### 3.1 Monorepo Package Layout

Lumi is structured as a Bun workspace monorepo:
- **`apps/*`**: Thin entrypoint applications (`@lumi/worker`, `@lumi/gateway`, `@lumi/scheduler`, `@lumi/dashboard`).
- **`packages/*`**: Shared core libraries (`@lumi/core`, `@lumi/event-bus`, `@lumi/observability`, `@lumi/sharding`, `@lumi/contracts`).

> [!WARNING]
> **Cross-Package Import Law**: Cross-package imports MUST use `@lumi/*` package specifiers. Never use relative paths (e.g. `../../packages/core`) across package boundaries.

### 3.2 Complete Path Alias Specifier Reference

Within `@lumi/core` (and symlinked third-party modules), imports are mapped via `package.json` `"imports"`:

| Import Alias | Target Resolution | Description |
| :--- | :--- | :--- |
| `#lib/*.js` | `./packages/core/src/lib/*.ts` | Core library modules and framework glue |
| `#database/*.js` | `./packages/core/src/lib/database/*.ts` | Database service, Prisma, Redis keys, cache |
| `#utilities/*.js` | `./packages/core/src/lib/utilities/*.ts` | Cards, formatters, time helpers, utilities |
| `#core/lib/*.js` | `./packages/core/src/lib/*.ts` | Alias for core library imports |
| `#core/module-system/*.js`| `./packages/core/src/lib/module-system/*.ts` | Module store, Service, listener bases |
| `#core/*.js` | `./packages/core/src/lib/*.ts` | Catch-all alias for core library |
| `#modules/*.js` | `./packages/core/src/modules/*.ts` | Module sub-stores and feature code |

> [!IMPORTANT]
> **Mandatory `.js` Extension Law**: Specifiers using import aliases MUST append `.js` (e.g. `import { Service } from '#core/module-system/Service.js'`), even though source files are written in `.ts`.

### 3.3 3rd-Party Addon Architecture & Symlink Resolution

Third-party downloaded modules reside in `data/3rd-party-modules/` and are symlinked into `packages/core/src/modules/`.
The root `package.json` contains a safety-net `"imports"` mapping that mirrors `packages/core/package.json` so imported aliases resolve seamlessly from third-party addon directories without breaking module encapsulation.

---

## 4. 🧰 Tech Stack & Approved Helper Libraries

### 4.1 Approved Framework Libraries

- **Runtime & Package Manager**: [Bun](https://bun.sh) (`1.3.0+`).
- **Discord Framework**: [@sapphire/framework](https://www.sapphirejs.dev/) (`5.3.0+`) & [discord.js](https://discord.js.org/) (`v14.18.0+`).
- **Schema Validation**: `@sapphire/shapeshift` (`cfg.*` builders).
- **ORM & Relational DB**: Prisma Client & PgBouncer PostgreSQL connection pooler.
- **Cache & Message Bus**: Redis 7 (Redis Streams, ioredis) & RabbitMQ.

### 4.2 Core Utility Reference Tables

#### `@discordjs/formatters`
| Helper Function | Approved Use Case | Example |
| :--- | :--- | :--- |
| `time(date, style?)` | Relative or styled timestamps | `time(date, 'R')` ➔ `<t:…:R>` |
| `userMention(id)` | Ping user | `userMention(id)` ➔ `<@id>` |
| `roleMention(id)` | Ping role | `roleMention(id)` ➔ `<@&id>` |
| `channelMention(id)` | Link channel | `channelMention(id)` ➔ `<#id>` |
| `inlineCode(text)` | Inline code snippet | `` inlineCode('foo') `` |
| `codeBlock(lang, text)`| Syntax-highlighted code block | `codeBlock('ts', code)` |

#### `@sapphire/utilities`
| Helper Function | Approved Use Case | Notes |
| :--- | :--- | :--- |
| `cutText(str, n)` | Truncate string to N chars | Prevents Discord 2000-char message error |
| `isNullish(v)` | Type-safe null/undefined check | Replaces loose `!v` checks |
| `filter(filterNullish)` | Type-safe array filtering | ❌ Replaces banned `.filter(Boolean)` |
| `tryParseJSON(str)` | Safe JSON parsing | ❌ Replaces `JSON.parse` inside try/catch |
| `chunk(arr, size)` | Array pagination chunking | Pagination for lists and tables |
| `regExpEsc(str)` | Escape regex metacharacters | Escapes user input for regex filters |
| `toTitleCase(str)` | Capitalize string words | Clean UI headers |

#### Helper Utilities
- **HTTP Fetch**: Use `@sapphire/fetch` (`fetch(...)`) instead of global `fetch()`.
- **Performance Stopwatch**: Use `@sapphire/stopwatch` (`new Stopwatch()`) instead of `performance.now()`.
- **Duration Formatting**: Use `container.utilities.time.humanizeDelta()`.

---

## 5. 🧩 Module System & Component Laws

### 5.1 `@DefineModule` Metadata Schema

Every module entrypoint (`index.ts`) must export a module class decorated with `@DefineModule`:

```typescript
import { Module, DefineModule, cfg } from "#core/module-system/Module.js";
import { Emojis } from "#lib/utilities/assets.js";

@DefineModule({
  name: "my_module",            // lowercase snake_case id
  displayName: "My Module",     // human-readable name
  emoji: Emojis.GEAR,
  version: "1.0.0",
  description: "Module description goes here",
  defaultEnabled: true,
  configSchema: {
    some_setting: cfg.boolean.default(true),
  },
})
export class MyModule extends Module {}
```

### 5.2 Sub-Store Directories

Feature modules organize code into sub-store folders:
- `commands/` - Extend `BaseCommand` or `BaseSubcommand`.
- `listeners/` - Extend `ModuleListener` or `GuildMessageListener`.
- `interaction-handlers/` - Extend Sapphire `InteractionHandler`.
- `services/` - Extend `Service` singleton class (`getService("<name>")` / `tryGetService("<name>")`).
- **`scheduled-tasks/`** - Extend `RelayTask` (placed in `scheduled-tasks/` exactly).

### 5.3 Zero Cross-Module Import Law & Permits

- **Zero Cross-Module Import Law**: Feature modules must **NEVER** import code directly from sibling modules (e.g. `import { foo } from '../other_module/service.js'` is strictly forbidden). Shared code belongs in `#lib/*`, `#database/*`, or `#utilities/*`.
- **Wick-style Permits**: Commands declare a required permit string node (e.g. `"mod.*"`, `"admin.*"`). `PermitResolver` evaluates granted permits with wildcard matching, bot/guild owner bypasses, and Anti-Nuke Quarantine interception. Permits are stored as `CustomPermit` or `EnforcedPermit`.

---

## 6. 💾 Database, Seeding & Storage Management

### 6.1 Database Access Law (`container.db`)

- **Mandate**: All database queries must go through **`container.db`** (`DatabaseService`).
- ❌ **Absolute Ban**: Modules must **NEVER** access `container.prisma` directly.

### 6.2 Cache Invalidation (`InvalidationBus`)

- All Redis key names must be registered in `RedisKeys` (`#database/redis.js`).
- Cache invalidations **must** pass through `InvalidationBus` (`container.invalidation`). Never call `redis.del` directly on shared keys.

### 6.3 Database Seeding & Environment Guardrails

- **Seeding Script**: Execute `bun run db:seed` (`scripts/seed.ts`).
- **QA Guild Target**: Seeds sample data under QA Test Guild ID `123456789012345678`.
- **Production Guardrails**: `scripts/seed.ts` contains a hard abort if `NODE_ENV === 'production'`. Never bypass this check.

---

## 7. ⚙️ Background Processing, Event Bus & RabbitMQ RPC Bridge

1. **Scheduled Tasks (BullMQ)**: Place task definitions in `src/modules/<name>/scheduled-tasks/` extending `RelayTask`.
2. **Event Bus (Redis Streams)**: Inter-process event streaming via `packages/event-bus`. `LUMI_ROLE=gateway` publishes raw Discord dispatches; workers consume them.
3. **RabbitMQ RPC Bridge**: Dashboard-to-worker communication via RabbitMQ. Register handlers via `registerRpcHandler` for web panel communication (`apps/dashboard`).

---

## 8. 🐙 Git, PR & CI Automation Protocols

### 8.1 Branching & Commit Conventions

- **Feature Branches**: Create feature branches (`git checkout -b feat/<name>`).
- **Commit Formatting**: Use Conventional Commits (`feat(mod): ...`, `fix(core): ...`, `docs: ...`).

### 8.2 Pull Request (PR) & ChatOps Protocol

- **PR Creation**: Create PRs via `gh pr create --title '...' --body '...'`.
- **ChatOps Slash Commands**:
  - `/format` - Runs `eslint --fix` and automatically commits/pushes style fixes back to the PR branch.
  - `/retest` - Re-triggers failing CI test suites.
  - `/bench` - Executes the benchmark suite (`bun run bench`) and posts latency/throughput performance results.
- **Merge Queues**: PRs pass through GitHub Merge Queue (`merge-group.yml`) before landing on `main`.

### 8.3 Pre-Commit Hooks (`lefthook.yml`)

- **Fast Pre-Commit Hook**: `lefthook` executes `typecheck` (filtered with `glob: "*.{ts,tsx,cts,mts}"`) and staged linting. Non-TypeScript commits execute in **0.02 seconds**.

### 8.4 Full Inventory of Lumi's 21 GitHub Automations

| Workflow | Category | Bot Purpose |
| :--- | :--- | :--- |
| `changeset-check.yml` | Quality Gate | Enforces changeset file inclusion on code PRs |
| `release.yml` | Release | Consumes changesets, updates `CHANGELOG.md`, opens version PRs & publishes releases |
| `ci.yml` | CI | Runs linting, typechecking, tests & Nix flake evaluation with Turborepo Git diffing |
| `slash-commands.yml` | ChatOps | Executes `/format`, `/retest`, and `/bench` |
| `comment.yml` | ChatOps | Adds instant reaction (`👀`) on `/lumi` or `@lumi-devs` comments |
| `review.yml` | PR Hygiene | Automatically minimizes/collapses dismissed bot comments via GraphQL |
| `pr-comment-summary.yml` | PR Hygiene | Posts & updates a sticky PR status overview comment |
| `auto-assign.yml` | PR Routing | Auto-assigns maintainers to incoming PRs based on `.github/auto_assign.yml` |
| `lock-threads.yml` | Maintenance | Automatically locks closed inactive issues & PRs after 60 days |
| `dependabot-auto-merge.yml` | Dependencies | Auto-approves and merges safe patch dependency PRs |
| `size-label.yml` | PR Triage | Auto-labels PR line diffs (`size:XS` to `size:XL`) |
| `labeler.yml` | PR Triage | Auto-labels PRs by modified path (`area:core`, `area:gateway`, etc.) |
| `labelsync.yml` | Repository | Syncs master 40-label taxonomy across the GitHub repository |
| `update-flake-lock.yml` | Nix | Bumps `flake.lock` inputs weekly via automated PRs |
| `security.yml` | Security | Runs GitHub CodeQL static analysis and `bun audit` |
| `docker.yml` | Packaging | Multi-arch Docker Buildx packaging pushed to GHCR |
| `welcome.yml` | Community | Greets first-time contributors submitting PRs |
| `stale.yml` | Maintenance | Marks inactive issues & PRs stale after 30 days |
| `triage.yml` | Maintenance | Appends `status: needs-triage` to new issue form submissions |
| `resilience.yml` | Testing | Runs Redis Streams chaos & fault-tolerance tests |
| `coverage.yml` | Testing | Generates Vitest code coverage reports and uploads LCOV artifacts |

---

## 9. 💻 UI Card System & i18n Rules

### 9.1 UI Card System (`#utilities/cards.js`)

- ❌ **Forbidden**: Constructing raw `EmbedBuilder` instances inside commands or services.
- ✅ **Mandatory**: Use Card System helpers: `makeInfoCard`, `makeSuccessCard`, `makeErrorCard`, `replySuccess(interaction, text)`, `replyError(interaction, text)`.

### 9.2 Internationalization (i18n)

- Translation files reside in `packages/core/src/languages/<locale>/<namespace>.json`.
- Fetch translators via `const t = await this.fetchT(interaction);`.
- Use localized string keys (e.g. `t('commands:ping.response', { ms })`).

---

## 10. 📊 Observability & Telemetry

- **Logging**: Use `this.logger` or `container.logger` (backed by `PinoSapphireLogger`). Banned raw `console.log`.
- **OpenTelemetry**: Enabled via `OTEL_ENABLED=true`. Traces HTTP requests, Prisma DB calls, and Redis Stream messages.
- **Metrics Exporter**: Prometheus registry exposed on `METRICS_PORT` (`:9090`). Custom metrics **must** be registered in `packages/observability/src/metrics.ts`.

---

## 11. ✅ Verification Command Matrix & Anti-Pattern Index

### 11.1 Verification Command Matrix

| Change Scope | Required Verification Command(s) |
| :--- | :--- |
| **Prisma Schema Changes** | `bun run db:generate` |
| **Module Metadata / `@DefineModule`** | `bun run modules:manifest` |
| **Development Database Seeding** | `bun run db:seed` |
| **Performance Benchmark Suite** | `bun run bench` |
| **TypeScript Code & Types** | `bun run typecheck` |
| **Code Style & Linting** | `bun run lint` |
| **Unit & Integration Tests** | `bun run test` |
| **End-to-End Tests** | `bun run test:e2e` |
| **System Resilience & Chaos** | `bun run verify:resilience` |
| **Third-Party Addon Package** | `bun run validate <path/to/addon>` |

### 11.2 Anti-Pattern Index

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           STRICT ANTI-PATTERN INDEX                         │
├────────────────────────────┬────────────────────────────────────────────────┤
│ Anti-Pattern               │ Rule Violation & Correct Alternative           │
├────────────────────────────┼────────────────────────────────────────────────┤
│ Raw EmbedBuilder           │ ❌ Banned. Use Card System helpers from cards.ts│
│ Cross-Module Imports       │ ❌ Banned. Move shared code to #lib/           │
│ Direct container.prisma    │ ❌ Banned. Use container.db (DatabaseService)  │
│ Direct redis.del           │ ❌ Banned. Use container.invalidation          │
│ Trivial Obvious Comments   │ ❌ Banned. Use self-documenting names           │
│ Redundant try-catch        │ ❌ Banned. Centralize error handling            │
│ AI Conversational Chatter  │ ❌ Banned. Remove introductory AI text in code │
│ Lazy `as any` Force Casts  │ ❌ Banned. Use interfaces, type guards, unknown │
│ Raw mention strings <@ID>  │ ❌ Banned. Use userMention/channelMention      │
│ Loose `!x` falsy checks    │ ❌ Banned. Use isNullish(x) / filterNullish     │
│ Raw MessageFlags.Ephemeral │ ❌ Banned. Use ephemeralCard() / replyError     │
│ Missing Changesets on PR   │ ❌ Banned. Run bunx changeset for package code │
│ Extensionless # imports    │ ❌ Banned. Always append .js extension         │
│ Context Window Dumping     │ ❌ Banned. Use grep_search and line slicing   │
│ Unverified Handoffs        │ ❌ Banned. Provide 5-Component Handoff Report │
└────────────────────────────┴────────────────────────────────────────────────┘
```
