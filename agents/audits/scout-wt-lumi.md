# Comprehensive Reconnaissance Report: `wt-lumi` vs `lumi-v2`

**Date**: 2026-11-25  
**Target Repositories / Worktrees**:
- **Baseline / Worktree**: `/home/rebiz/opt/workdir/wt-lumi` (Branch `wt/fixes`, Commit `03b17b78b12cbc712abd672e271db572cc6b23bd` — 2026-11-13)
- **Active v2 Core**: `/home/rebiz/opt/workdir/lumi-v2` (Branch `v2/develop`, Commit `898c7a7aa25141718f686fe321826b5bbedb5933` — 2026-11-24)

---

## 1. Executive Summary

A comprehensive diff and architectural comparison between `/home/rebiz/opt/workdir/wt-lumi` (`wt/fixes`) and `/home/rebiz/opt/workdir/lumi-v2` (`v2/develop`) reveals two divergent branches with distinct evolutionary paths:

1. **The Lost Subsystem — `custom-commands`**:
   - `wt-lumi` contains a complete, battle-tested, zero-JS AST-interpreted **Custom Commands** engine (`modules/custom-commands/core/`), with 4 database models (`CustomCommandGroup`, `CustomCommand`, `CustomCommandSchedule`, `CustomCommandKv`), Prisma helpers (`packages/db/src/helpers/customCommands.ts`), 5 unit test suites, and specification docs (`agents/custom-commands.md`).
   - In `lumi-v2`, this entire module and its database schemas were **unintentionally lost** following a `git reset --hard` to `rescue/arch-overhaul` (`bbdc342a9df61884253dbbc7c52e0c12404e182b`).
   - **Recommendation**: This subsystem must be recovered from `wt-lumi` and re-integrated into `lumi-v2`.

2. **Major Architectural Upgrades in `lumi-v2`**:
   - **Extracted `@lumi/cron` Package**: Unified 5-field cron parsing, IANA timezones, and distributed Redis-locked task scheduling.
   - **Decoupled Admin Panel Architecture**: Purged ~1,600 lines of centralized admin panels (`src/admin/panel/tempvc.ts`, `src/admin/panel/roles/{autorole,roleMenus,voiceroles}.ts`) in favor of module-colocated `admin.ts` controllers.
   - **Single Source of Truth (`GuildModule`)**: Completely removed legacy config-migration loops and config-based module activation checks. Module enable state is authoritative in Postgres `guild_modules`.
   - **Addon Ecosystem & DevEx**: Added Redbot-style CLI tooling (`addon:create`, `addon:link`, `addon:unlink`, `addon:validate`), `@lumi/module-kit` scoped storage (`scopedDataStore`), and dynamic runtime module reloading (`/owner reload module:<name>`).
   - **Hardened Dispatch & Blacklisting**: Enforced user/guild blacklists on prefix commands and integrated prefix errors into `ErrorStore`.
   - **Dashboard Modernization**: SvelteKit 3.4.0, Vite 8.3.8, Svelte 5.59.1, containerized multi-stage Docker build, and workspace package integration.

---

## 2. Directory & Package Inventory Matrix

| Area / Subsystem | `wt-lumi` (`wt/fixes`) | `lumi-v2` (`v2/develop`) | Status & Action |
| :--- | :--- | :--- | :--- |
| **`modules/custom-commands/`** | **Present** (Complete AST engine, 12 files) | **Missing** (Deleted in git reset) | **CRITICAL RESCUE**: Port to `lumi-v2` |
| **`packages/cron/`** (`@lumi/cron`) | **Missing** | **Present** (Extracted monorepo package) | Keep `lumi-v2` architecture |
| **`packages/db` Prisma Schema** | Includes `CustomCommand*` models | Missing `CustomCommand*` models | **RESCUE**: Restore models in schema |
| **`packages/db` Helpers** | Has `src/helpers/customCommands.ts` | Missing `customCommands.ts` | **RESCUE**: Restore DB helpers |
| **`src/admin/panel/tempvc.ts`** | Present (635 lines) | **Deleted** (Decoupled to module) | Keep `lumi-v2` (Cleanup tech debt) |
| **`src/admin/panel/roles/*`** | Present (Autorole, Menus, Voiceroles) | **Deleted** (Decoupled to modules) | Keep `lumi-v2` (Cleanup tech debt) |
| **`scripts/` Addon Tooling** | Missing | `create-addon`, `link-addon`, `validate-addon` | Keep `lumi-v2` |
| **`scripts/sync-prisma.ts`** | Missing | Present (Syncs types to workspaces) | Keep `lumi-v2` |
| **`scripts/seed.ts`** | Missing | Present (Local DB seeder) | Keep `lumi-v2` |
| **`src/core/prefix.ts`** | 408 lines (No blacklist check) | 476 lines (Blacklist + ErrorStore) | Keep `lumi-v2` |
| **`src/core/guildSync.ts`** | 124 lines (Config-field feature parsing) | 57 lines (Pure `GuildModule` lookup) | Keep `lumi-v2` |
| **`src/core/moduleConfig.ts`** | 82 lines (Legacy version migrations) | 23 lines (Clean config service) | Keep `lumi-v2` |
| **`src/core/ownerCommands.ts`**| 440 lines | 497 lines (Added module hot-reload) | Keep `lumi-v2` |
| **`src/core/rpcRoutes.ts`** | 458 lines | 685 lines (Addon RPC + Cache Busting) | Keep `lumi-v2` |
| **`apps/dashboard/`** | SvelteKit 3.1.1, no Dockerfile | SvelteKit 3.4.0 + Dockerfile | Keep `lumi-v2` |
| **`data/addons/`** | Physical folder `confessions` | Symlinked addon via `link-addon` | Keep `lumi-v2` |
| **`agents/` Markdown** | Has `custom-commands.md` | Has `cron.md`, missing `custom-commands.md`| Merge documentation |

---

## 3. In-Depth Subsystem Analysis

### 3.1 The Custom Commands Engine (`modules/custom-commands/core/`)

#### Missing in `lumi-v2`, Full Implementation in `wt-lumi`:
- **Path**: `/home/rebiz/opt/workdir/wt-lumi/modules/custom-commands/core/`
- **Architecture**: Guild-scoped, code-free custom command runtime. Interprets templated cards via a secure recursive descent AST without `eval`, `Function`, or Node VM execution.

```
modules/custom-commands/core/
├── commands/
│   ├── customcommand.ts      # Command definition & router (/customcommand & /cc)
│   ├── handlers.ts           # Slash command action implementations (crud, import/export)
│   └── run.ts                # Slash command /cc run handler
├── template/
│   ├── ast.ts                # AST node types (Text, Var, If, Unless, Range, Filter, KV)
│   ├── tokenizer.ts          # Lexer with position tracking & token validation
│   ├── parser.ts             # Recursive descent parser with 5,000 node limit
│   ├── evaluator.ts          # AST evaluation engine with step & recursion budgets
│   └── filters.ts            # Safe formatting filters (upper, lower, json, mention, etc.)
├── scheduler/
│   └── task.ts               # Cron & interval polling runner with Redis distributed locking
├── kv/
│   └── store.ts              # Per-guild, per-user KV store backed by Postgres & Redis
├── listeners/
│   ├── messages.ts           # Prefix/regex/contains/startsWith trigger router
│   ├── interactions.ts       # Button/select/modal custom-id router
│   └── reactions.ts          # Reaction add/remove trigger router
├── manifest.json             # Module manifest with permit declarations
├── index.ts                  # Module lifecycle entrypoint
└── tests/
    ├── tokenizer.test.ts     # Lexer test suite
    ├── parser.test.ts        # AST parsing suite
    ├── evaluator.test.ts     # Template execution & security budget test suite
    ├── cron.test.ts          # Cron expression & interval parsing suite
    └── commands.test.ts      # Command handling & dispatch integration suite
```

#### Database Models Required in `packages/db/prisma/schema.prisma`:
```prisma
model CustomCommandGroup {
  id          String          @id @default(cuid())
  guildId     String          @map("guild_id")
  name        String
  description String?
  createdAt   DateTime        @default(now()) @map("created_at")
  commands    CustomCommand[]

  guild Guild @relation(fields: [guildId], references: [id], onDelete: Cascade)

  @@unique([guildId, name])
  @@index([guildId])
  @@map("custom_command_groups")
}

model CustomCommand {
  id              String                 @id @default(cuid())
  guildId         String                 @map("guild_id")
  groupId         String?                @map("group_id")
  name            String
  description     String?
  triggerType     String                 @map("trigger_type")
  triggerValue    String                 @map("trigger_value")
  responses       Json
  enabled         Boolean                @default(true)
  cooldown        Int                    @default(0)
  permissionNodes String[]               @default([]) @map("permission_nodes")
  createdBy       String                 @map("created_by")
  createdAt       DateTime               @default(now()) @map("created_at")
  updatedAt       DateTime               @updatedAt @map("updated_at")
  group           CustomCommandGroup?    @relation(fields: [groupId], references: [id], onDelete: SetNull)
  schedule        CustomCommandSchedule?

  guild Guild @relation(fields: [guildId], references: [id], onDelete: Cascade)

  @@unique([guildId, name])
  @@index([guildId, triggerType])
  @@map("custom_commands")
}

model CustomCommandSchedule {
  id              String        @id @default(cuid())
  commandId       String        @unique @map("command_id")
  cron            String?
  intervalSeconds Int?          @map("interval_seconds")
  timezone        String        @default("UTC")
  nextRunAt       DateTime      @map("next_run_at")
  lastRunAt       DateTime?     @map("last_run_at")
  command         CustomCommand @relation(fields: [commandId], references: [id], onDelete: Cascade)

  @@index([nextRunAt])
  @@map("custom_command_schedules")
}

model CustomCommandKv {
  id        String    @id @default(cuid())
  guildId   String    @map("guild_id")
  userId    String    @map("user_id")
  key       String
  value     Json
  expiresAt DateTime? @map("expires_at")
  createdAt DateTime  @default(now()) @map("created_at")
  updatedAt DateTime  @updatedAt @map("updated_at")

  guild Guild @relation(fields: [guildId], references: [id], onDelete: Cascade)

  @@unique([guildId, userId, key])
  @@index([guildId, userId])
  @@index([expiresAt])
  @@map("custom_command_kv")
}
```

---

### 3.2 Cron & Task Scheduling Evolution

- **In `wt-lumi`**:
  - Ad-hoc regex parsing for cron strings inside individual modules.
  - `modules/utility/tempvc` used a raw `setInterval` timer polling every 15 seconds to delete empty voice channels.
- **In `lumi-v2`**:
  - Extracted package `@lumi/cron` (`packages/cron/`):
    - `parseCronExpression(expr)` validates standard 5-part cron syntax with step, range, and list support.
    - `CronScheduler`: Integrates Redis distributed locking (`withKeyLock` / Redlock pattern) to ensure scheduled tasks only run on one instance in multi-pod deployments.
    - `tempvc` converted from raw timer loop to a registered `@lumi/cron` background task.

---

### 3.3 Admin Panel Decoupling (Legacy Debt Purged in `lumi-v2`)

`wt-lumi` maintained two parallel administrative systems: centralized monolith panel handlers and module-level handlers. `lumi-v2` completed the migration:

```
wt-lumi (Coupled Monolith)               lumi-v2 (Decoupled Module Panels)
src/admin/panel/tempvc.ts (635 lines)    ──> modules/utility/tempvc/admin.ts
src/admin/panel/roles/autorole.ts (188)  ──> modules/roles/autorole/admin.ts
src/admin/panel/roles/roleMenus.ts (516) ──> modules/role-menus/menu/admin.ts
src/admin/panel/roles/voiceroles.ts (230)──> modules/roles/voiceroles/admin.ts
```
**Outcome**: 1,569 lines of redundant, high-coupling code were eliminated in `lumi-v2`, with interactions dynamically routed via `HubPanel` directly to module-registered admin views.

---

### 3.4 State Authority & Cache Architecture

- **`GuildModule` Single Source of Truth**:
  - `wt-lumi` (`src/core/guildSync.ts:60-120`): Parsed module configuration JSON fields for `{ enabled: true/false }`, attempting to reconcile JSON fields with DB tables.
  - `lumi-v2` (`src/core/guildSync.ts:1-57`): The `GuildModule` table is strictly authoritative. Configuration only holds module-specific parameters.
- **Cache Synchronization**:
  - `lumi-v2` added Redis Pub/Sub broadcast events in `ConfigService` (`packages/cache/` / `src/admin/services/ConfigService.ts`). When guild settings are altered through the dashboard or admin panel, an invalidation message is published to clear TieredCache entries on all connected bot instances.

---

### 3.5 Addon Tooling & Developer Experience

`lumi-v2` introduced CLI workflows inspired by Redbot for managing independent modules and community addons:
1. `bun run addon:create <name>` (`scripts/create-addon.ts`): Scaffolds an addon skeleton containing `manifest.json`, command definitions, event listeners, and documentation.
2. `bun run addon:link <path>` (`scripts/link-addon.ts`): Symlinks local external addons into `data/addons/` for rapid development without copying.
3. `bun run addon:validate <dir>` (`scripts/validate-addon.ts`): Enforces architectural guardrails: verifies imports are restricted to `@lumi/foundation`, `@lumi/module-kit`, and `@lumi/ui`, disallows internal bot imports, and validates card structures.
4. `packages/module-kit/src/data.ts` (`scopedDataStore`): Provides addons with safe JSON key-value persistence scoped to `(guildId, addonName)`, preventing direct schema pollution.
5. `/owner reload module:<name>`: Dynamic hot-reloading in `src/core/ownerCommands.ts` allows module unregister and re-instantiation without dropping the gateway connection.

---

### 3.6 Security & Dispatch Hardening

In `wt-lumi`, message prefix commands bypassed blacklist validation. In `lumi-v2`:
- `src/core/prefix.ts` performs concurrent blacklist lookups (`isUserBlacklisted` and `isGuildBlacklisted`) using cache-first helpers before executing prefix commands.
- Autocomplete interactions in `src/core/dispatch.ts` verify caller permissions (`hasAdminAccess` / `hasPermitAccess`) before returning sensitive parameter lists.
- Exceptions thrown in prefix command execution are tracked in `ErrorStore`, generating a unique trace ID returned to the user in a styled `@lumi/ui` error card.

---

### 3.7 Apps: Dashboard & Web Architecture

- **Dependency Upgrades**:
  - SvelteKit upgraded from `3.1.1` to `3.4.0`.
  - Svelte upgraded from `5.57.3` to `5.59.1`.
  - Vite upgraded from `8.0.12` to `8.3.8`.
  - Type-checking pipeline enforces `svelte-check --tsconfig ./tsconfig.json && tsc --noEmit`.
- **Packaging & Deployment**:
  - `lumi-v2` added a dedicated multi-stage `apps/dashboard/Dockerfile` with isolated workspace dependency builds.
  - Monorepo packages `@lumi/cache`, `@lumi/foundation`, `@lumi/module-kit`, and `@lumi/redis` are imported directly by the dashboard via pnpm/bun workspace references.

---

## 4. Key File Comparison & Anchors

| Subsystem | File Path (`lumi-v2` unless specified) | Lines | Key Responsibility / Changes |
| :--- | :--- | :--- | :--- |
| **Custom Commands** | `wt-lumi/modules/custom-commands/core/template/evaluator.ts` | 420 | AST evaluator with execution budget, depth limit, and KV hooks |
| **Custom Commands** | `wt-lumi/modules/custom-commands/core/template/parser.ts` | 315 | Recursive descent parser generating template AST |
| **Custom Commands** | `wt-lumi/packages/db/src/helpers/customCommands.ts` | 240 | Safe Prisma helper methods for custom command CRUD & KV operations |
| **Cron System** | `packages/cron/src/cron.ts` | 185 | 5-field cron parser and schedule calculator |
| **Cron System** | `packages/cron/src/scheduler.ts` | 160 | Distributed task runner with Redis key locking |
| **Core Dispatch** | `src/core/dispatch.ts` | 517 | Global interaction routing, autocomplete authorization, error tracing |
| **Core Prefix** | `src/core/prefix.ts` | 476 | Prefix routing, blacklist enforcement, and trace error card generation |
| **Module Config** | `src/core/moduleConfig.ts` | 23 | Streamlined config service bindings (purged 59 lines of legacy migration shims) |
| **Guild Sync** | `src/core/guildSync.ts` | 57 | Authoritative `GuildModule` status synchronization |
| **Owner Commands** | `src/core/ownerCommands.ts` | 497 | Added `/owner reload module:<name>` with autocomplete |
| **RPC Routes** | `src/core/rpcRoutes.ts` | 685 | Expanded RPC endpoints for remote addon management & cache invalidation |
| **DevEx Tools** | `scripts/create-addon.ts` | 172 | Scaffolds Redbot-style cog/addon packages |
| **DevEx Tools** | `scripts/validate-addon.ts` | 183 | Addon AST and manifest validator enforcing security sandbox rules |
| **Addon Storage** | `packages/module-kit/src/data.ts` | 134 | `scopedDataStore` implementation for addon persistence |

---

## 5. Architectural Recommendations for Next Phase

1. **Re-integrate Custom Commands Subsystem**:
   - Copy `modules/custom-commands/core/` from `wt-lumi` to `lumi-v2`.
   - Re-introduce the 4 models (`CustomCommandGroup`, `CustomCommand`, `CustomCommandSchedule`, `CustomCommandKv`) into `packages/db/prisma/schema.prisma`.
   - Restore `packages/db/src/helpers/customCommands.ts` and run `bun run db:generate`.
   - Update `modules/custom-commands/core/scheduler/task.ts` to utilize the new `@lumi/cron` package rather than its internal cron scheduler.
   - Restore the 5 unit test suites under `modules/custom-commands/core/tests/`.
   - Restore `agents/custom-commands.md`.

2. **Retain All `lumi-v2` Architectural Improvements**:
   - Maintain the decoupled `admin.ts` architecture across modules; do not re-introduce the centralized panels from `wt-lumi`.
   - Maintain `@lumi/cron` for all scheduled routines (reminders, tempvc, backups, custom commands).
   - Maintain `scopedDataStore` and the new addon developer tooling (`addon:create`, `addon:link`, `addon:validate`).
   - Maintain the hardened prefix dispatch with blacklist checks and trace ID error reporting.

3. **Prune Stale Branches / Worktrees**:
   - Once `custom-commands` is committed to `v2/develop`, the `wt-lumi` worktree (`wt/fixes`) can be cleanly synchronized or pruned.