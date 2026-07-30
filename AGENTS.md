# 🤖 Lumi AI Agent Operating Specification & Monorepo Architecture Blueprint

> [!IMPORTANT]
> This document is the **absolute operational specification** for AI coding agents and human developers working within the Lumi repository. Autonomous and semi-autonomous AI agents **must** adhere to these protocols, safety constraints, coding standards, and verification requirements without exception.

---

## 📖 Table of Contents

1. [Phased Task Execution Lifecycle & Handoff Standard](#1-phased-task-execution-lifecycle--handoff-standard)
2. [Changeset Creation & Release Workflow Protocols](#2-changeset-creation--release-workflow-protocols)
3. [Monorepo Architecture & Path Resolution Spec](#3-monorepo-architecture--path-resolution-spec)
4. [Module System & Component Laws](#4-module-system--component-laws)
5. [Database, Seeding & Storage Management](#5-database-seeding--storage-management)
6. [Git, PR & CI Automation Protocols](#6-git-pr--ci-automation-protocols)
7. [UI Card System, i18n & Helper Libraries](#7-ui-card-system-i18n--helper-libraries)
8. [Observability, Resilience & Verification Command Matrix](#8-observability-resilience--verification-command-matrix)

---

## 1. 🤖 Phased Task Execution Lifecycle & Handoff Standard

To ensure predictable, reliable, and transparent agent operations, all Lumi agents must strictly adhere to a standardized 5-Phase Task Execution Lifecycle and utilize a structured 5-Component Handoff Report Protocol. This methodology ensures state is preserved across agent sessions and inter-agent collaboration is seamless.

### 1.1 5-Phase Task Execution Lifecycle

All tasks, regardless of size, must proceed through the following 5 chronological phases:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       AI AGENT TASK EXECUTION LIFECYCLE                     │
├───────────────┬─────────────────────────────────────────────────────────────┤
│ Phase 1       │ Ingestion & Briefing Analysis (Read-Only)                   │
│               │ Inspect code, locate exact lines, read briefing/progress.  │
├───────────────┼─────────────────────────────────────────────────────────────┤
│ Phase 2       │ Exploration & Planning                                      │
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

### 1.2 Persistent Working Memory (`progress.md` & `BRIEFING.md`)

- **`BRIEFING.md`**: The Immutable Source of Truth containing core system architecture, constraints, and dependency rules.
- **`progress.md`**: The Mutable Scratchpad tracking immediate task queues, completed checklists, and blockers.

### 1.3 5-Component Handoff Report Protocol

All agent handoff reports must contain the following 5 sections:
1. **Observation**: Verbatim file paths, line numbers, exact errors, and tool output quotes.
2. **Logic Chain**: Step-by-step reasoning connecting observations to conclusions.
3. **Caveats**: Scope limits, unverified edge cases, assumptions made.
4. **Conclusion**: Clear, actionable assessment supported by logic.
5. **Verification Method**: Exact commands and file paths to independently verify work.

---

## 2. 📦 Changeset Creation & Release Workflow Protocols

Lumi utilizes a monorepo architecture leveraging Changesets (`@changesets/cli` + `@changesets/action`) for version management, automated changelog generation, and GitHub Release publishing.

### 2.1 Changeset Creation Protocol

Whenever an agent modifies source code within `packages/` or `apps/`, it is **mandatory** to generate a corresponding changeset file before concluding the task.

- **Command**: `bunx changeset` (or programmatic creation of `.changeset/*.md`).
- **CI Enforcement**: `.github/workflows/changeset-check.yml` automatically blocks PRs touching package/app code without a changeset.

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

## 4. 🧩 Module System & Component Laws

### 4.1 `@DefineModule` Metadata Schema

Every module entrypoint (`index.ts`) must export a module class decorated with `@DefineModule`:

```typescript
import { Module, DefineModule, cfg } from "#core/module-system/Module.js";

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

### 4.2 Sub-Store Directories

Feature modules organize code into sub-store folders:
- `commands/` — Extend `BaseCommand` or `BaseSubcommand`.
- `listeners/` — Extend `ModuleListener` or `GuildMessageListener`.
- `interaction-handlers/` — Extend Sapphire `InteractionHandler`.
- `services/` — Extend `Service` singleton class.
- **`scheduled-tasks/`** — Extend `RelayTask` (placed in `scheduled-tasks/` exactly).

### 4.3 Zero Cross-Module Import Law & Permits

- **Zero Cross-Module Import Law**: Feature modules must **NEVER** import code directly from sibling modules (e.g. `import { foo } from '../other_module/service.js'` is strictly forbidden). Shared code belongs in `#lib/*`, `#database/*`, or `#utilities/*`.
- **Wick-style Permits**: Commands declare a required permit string node (e.g. `"mod.*"`). `PermitResolver` evaluates granted permits with wildcard matching, bot/guild owner bypasses, and Anti-Nuke Quarantine interception.

---

## 5. 💾 Database, Seeding & Storage Management

### 5.1 Database Access Law (`container.db`)

- **Mandate**: All database queries must go through **`container.db`** (`DatabaseService`).
- ❌ **Absolute Ban**: Modules must **NEVER** access `container.prisma` directly.

### 5.2 Cache Invalidation (`InvalidationBus`)

- All Redis key names must be registered in `RedisKeys` (`#database/redis.js`).
- Cache invalidations **must** pass through `InvalidationBus` (`container.invalidation`). Never call `redis.del` directly on shared keys.

### 5.3 Database Seeding & Environment Guardrails

- **Seeding Script**: Execute `bun run db:seed` (`scripts/seed.ts`).
- **QA Guild Target**: Seeds sample data under QA Test Guild ID `123456789012345678`.
- **Production Guardrails**: `scripts/seed.ts` contains a hard abort if `NODE_ENV === 'production'`. Never bypass this check.

---

## 6. 🐙 Git, PR & CI Automation Protocols

### 6.1 Branching & Commit Conventions

- **Feature Branches**: Create feature branches (`git checkout -b feat/<name>`).
- **Commit Formatting**: Use Conventional Commits (`feat(mod): ...`, `fix(core): ...`, `docs: ...`).

### 6.2 Pull Request (PR) Protocol

- **PR Creation**: Create PRs via `gh pr create --title '...' --body '...'`.
- **Merge Queues**: PRs pass through GitHub Merge Queue (`merge-group.yml`) before landing on `main`.

### 6.3 Pre-Commit Hooks (`lefthook.yml`)

- **Fast Pre-Commit Hook**: `lefthook` executes `typecheck` (filtered with `glob: "*.{ts,tsx,cts,mts}"`) and staged linting. Non-TypeScript commits execute in **0.02 seconds**.

---

## 7. 💻 UI Card System, i18n & Helper Libraries

### 7.1 UI Card System (`#utilities/cards.js`)

- ❌ **Forbidden**: Constructing raw `EmbedBuilder` instances inside commands or services.
- ✅ **Mandatory**: Use Card System helpers: `makeInfoCard`, `makeSuccessCard`, `makeErrorCard`, `replySuccess(interaction, text)`, `replyError(interaction, text)`.

### 7.2 Core Helper Libraries Reference

#### `@discordjs/formatters`
| Helper Function | Use Case |
| :--- | :--- |
| `time(date, style?)` | Relative or styled timestamps (`<t:…:R>`) |
| `userMention(id)` | Ping user (`<@id>`) |
| `roleMention(id)` | Ping role (`<@&id>`) |
| `channelMention(id)` | Link channel (`<#id>`) |
| `inlineCode(text)` | Inline code snippet |

#### `@sapphire/utilities`
| Helper Function | Approved Use Case |
| :--- | :--- |
| `cutText(str, n)` | Truncate string to N chars |
| `isNullish(v)` | Check null / undefined |
| `filter(filterNullish)` | Type-safe array filtering |
| `tryParseJSON(str)` | Safe JSON parsing |
| `chunk(arr, size)` | Array pagination chunking |

### 7.3 Internationalization (i18n)

- Translation files reside in `packages/core/src/languages/<locale>/<namespace>.json`.
- Fetch translators via `const t = await this.fetchT(interaction);`.
- Use localized string keys (e.g. `t('commands:ping.response', { ms })`).

---

## 8. ✅ Verification Command Matrix & Anti-Pattern Index

### 8.1 Verification Command Matrix

| Change Scope | Required Verification Command(s) |
| :--- | :--- |
| **Prisma Schema Changes** | `bun run db:generate` |
| **Module Metadata / `@DefineModule`** | `bun run modules:manifest` |
| **Development Database Seeding** | `bun run db:seed` |
| **TypeScript Code & Types** | `bun run typecheck` |
| **Code Style & Linting** | `bun run lint` |
| **Unit & Integration Tests** | `bun run test` |
| **End-to-End Tests** | `bun run test:e2e` |
| **System Resilience & Chaos** | `bun run verify:resilience` |
| **Third-Party Addon Package** | `bun run validate <path/to/addon>` |

### 8.2 Anti-Pattern Index

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
│ Missing Changesets on PR   │ ❌ Banned. Run bunx changeset for package code │
│ Raw <@ID> string formatting│ ❌ Banned. Use userMention(id) from formatters │
│ .filter(Boolean) on arrays │ ❌ Banned. Use .filter(filterNullish)          │
│ JSON.parse in try/catch    │ ❌ Banned. Use tryParseJSON(str)               │
│ Extensionless # imports    │ ❌ Banned. Always append .js extension         │
│ Context Window Dumping     │ ❌ Banned. Use grep_search and line slicing   │
│ Unverified Handoffs        │ ❌ Banned. Provide 5-Component Handoff Report │
└────────────────────────────┴────────────────────────────────────────────────┘
```
