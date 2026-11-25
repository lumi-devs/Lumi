# Lumi Addons Scout Report

**Target Repository**: `/home/rebiz/opt/workdir/lumi-addons/`  
**Host Application**: `/home/rebiz/opt/workdir/lumi-v2/`  
**Date**: November 2026  
**Auditor**: Antigravity Scout  

---

## Executive Summary

The `lumi-addons` repository contains 11 first-party dynamically loaded add-on modules for Lumi v2. Add-ons are architected as flat directories containing metadata (`manifest.json`), an entrypoint (`index.ts`) defining a module via `@lumi/module-kit`, and modular components (commands, Discord event listeners, cron tasks, UI cards, data accessors, and tests).

The codebase adheres to high TypeScript standards (`strict: true`, `noUncheckedIndexedAccess: true`) and strict linter rules (`biome.json` with `noExplicitAny: "error"` and import restrictions). However, significant discrepancies exist in permission validation patterns, configuration schemas (Zod vs. manifest JSON duplication), test coverage gaps, and architectural boundaries between modules and host runtime.

---

## 1. All Addons and Their Purpose

| # | Addon Directory | Category | Version | Primary Purpose & Capabilities |
|---|---|---|---|---|
| 1 | `activity-roles` | Roles | `2.0.0` | Assigns/revokes Discord roles dynamically based on member activities (Playing, Streaming, Listening, Watching, Custom, Competing). Includes periodic reconciliation sweeps. |
| 2 | `booster-roles` | Roles | `2.0.0` | Provides server boosters with self-managed custom roles: custom color (hex), custom name, role sharing with friends, showcase announcements, grace-period cleanup on boost lapse, and admin blacklist. |
| 3 | `confessions` | Community | `2.1.0` | Anonymous confessions and threaded reply trees. Uses irreversible per-guild salted SHA-256 author hashes for cooldowns and moderator bans. Supports image uploads, DM notifications with opt-out, and report pipelines. |
| 4 | `dragme` | Voice | `2.0.0` | Pull requests into voice channels. Users request entry into a voice channel; an occupant approves or declines via interactive buttons. Automatically cleans up expired requests. |
| 5 | `economy-games` | Economy | `2.0.0` | Ledger-backed gambling and economy activities: interactive Blackjack (hit/stand/double), European Roulette, Crime with jail system, Grinds (work, beg, fish, mine), and an Item Shop (`/gameshop`) with inventory and role granting/toggling. |
| 6 | `multi-lounge` | Voice | `2.0.0` | Auto-scaling temporary voice lounges. Dynamically clones a base channel when all channels in a group meet the busy threshold; deletes empty extra channels while preserving contiguous numbering (`Lounge 1`, `Lounge 2`). |
| 7 | `promoter` | Roles | `2.0.0` | Auto-roles members who promote the guild via matching strings in custom status or by wearing the native Discord Server Tag. Automatically revokes the role when promotion ceases. |
| 8 | `rolementions` | Moderation | `2.0.0` | Protects sensitive roles from mention spam. Automatically sets `mentionable: false` for a cooldown duration when a protected role is pinged, then restores it. Tracks daily role mention analytics with 48h TTL. |
| 9 | `status` | Utility | `2.0.0` | Bot-owner rotating presence manager. Cycles through custom status messages and activities (`Playing`, `Watching`, `Listening`, `Streaming`, `Competing`, `Custom`) with dynamic `{guilds}` and `{users}` placeholders. Resolves multi-tenant bot ownership via active controller guild election. |
| 10 | `thread-cleaner` | Moderation | `2.0.0` | Background maintenance worker that monitors threads in configured parent channels. Automatically locks or archives threads after a configurable inactivity period, with debounced reset on active conversation. |
| 11 | `utility` | Utility | `2.0.0` | General server tools: `/steal` (steals custom emojis from messages or URLs with DNS-pinned SSRF protection) and `/translate` (translates text across languages via Google Translate GTX API). |

---

## 2. Addon Interface & Contract (How Addons Plug In)

Addons plug into Lumi v2 through contracts exported by `@lumi/module-kit`. Each addon must default-export `defineModule({...})` from its entrypoint (typically `index.ts`).

### 2.1 The `ModuleDefinition` Contract

```typescript
export interface ModuleDefinition {
  name: string;                                     // Must match manifest.name & directory name
  displayName: string;
  emoji: string;
  description: string;                              // Max 200 chars
  version: string;                                  // Semver x.y.z
  config: unknown;                                  // Zod schema for guild configuration
  dataLifecycle?: ModuleDataLifecycle;              // GDPR export/deletion handlers
  commands: readonly CommandDefinition[];           // Slash command builders & handlers
  listeners: readonly ListenerDefinition[];         // Discord.js event subscriptions
  tasks: readonly TaskDefinition[];                 // Scheduled cron jobs
  permitNodes?: readonly string[];                  // Registered Lumi permission nodes
  onLoad: (services: ModuleServices) => Promise<Disposer[]>;
  onUnload: (services: ModuleServices) => Promise<void>;
  dependencies?: Readonly<Record<string, string>>;  // Versioned dependencies on other modules
  requirements?: readonly string[];                 // External npm package requirements
  conflicts?: readonly string[];                    // Mutually exclusive module names
}
```

### 2.2 Injected `ModuleServices`

When loaded, each addon receives a `ModuleServices` object containing all runtime host capabilities:
- `services.client`: Discord.js `Client` instance.
- `services.discord`: Constants including `PermissionFlagsBits`.
- `services.modules`: `ModuleRegistryAccess` (`isEnabled(guildId, moduleName)`).
- `services.config`: Guild-scoped module configuration reader/writer.
- `services.moduleConfig`: Centralized `ModuleConfigService` (`read`, `save`).
- `services.permits`: `PermitRepository` for fine-grained permission resolution (`explainPermit`).
- `services.helpers`: Database helpers (`DbHelpers`):
  - `helpers.moduleData`: Key-value storage across Redis + Postgres (`get`, `set`, `take`, `delete`, `deleteForUser`, `list`).
  - `helpers.cache`: Redis caching layer (`getString`, `setString`, `del`, `takeLock`, `setNx`, `distributed`).
  - `helpers.economy`: Transactional economy ledger operations (`adjustBalance`, `transfer`, `getBalance`).
- `services.scheduler`: `DistributedScheduler` for delayed and one-shot executions.
- `services.observability`: Structured logging (`logger.info`, `logger.warn`, `logger.error`) and `healthMonitor`.
- `services.ui`: Components V2 UI kit (`makeInfoCard`, `makeErrorCard`, `cardMessage`, etc.).
- `services.moduleName`: Name of the loaded module.

### 2.3 Sub-Component Contracts

1. **Commands (`CommandDefinition`)**:
   - `data`: `SlashCommandBuilder` (or options/subcommands builder).
   - `execute: (interaction: ChatInputCommandInteraction, services: ModuleServices) => Promise<void>`.
   - `autocomplete?: (interaction: AutocompleteInteraction, services: ModuleServices) => Promise<void>`.
   - Flags: `requiredPermit`, `requiresAdmin`, `ownerOnly`, `guildOnly`, `cooldownSeconds`.

2. **Listeners (`ListenerDefinition`)**:
   - `event: string` (e.g. `interactionCreate`, `voiceStateUpdate`, `presenceUpdate`, `messageCreate`).
   - `handler: (...args: any[]) => Promise<void>`. Addons must filter `guildId`, check `services.modules.isEnabled()`, and match custom ID prefixes (`${ModuleName}:`).

3. **Tasks (`TaskDefinition`)**:
   - `name: string`.
   - `cron: string` (5-field cron string, e.g. `*/5 * * * *`).
   - `handler: (services: ModuleServices) => Promise<void>`.
   - `timezone?: string` (defaults to UTC).

4. **GDPR Lifecycle (`ModuleDataLifecycle`)**:
   - `exportUserData(services, guildId, userId): Promise<unknown>`
   - `deleteUserData(services, guildId, userId): Promise<UserDataDeletionResult>`

---

## 3. Shared Patterns Between Addons

Across all 11 addons, standard conventions have been established:

1. **Target ID Scoping for `moduleData`**:
   - `"_"` (Guild target): Stored globally for the server (e.g. guild-wide salts, global counters, feature stats, activity rules).
   - `userId`: Per-user state (e.g. booster role ownership, jail sentences, inventories, pending drag requests).
   - `roleId` / `channelId` / `threadId`: Entity-specific records (e.g. role mentions blocks, tracked thread states).

2. **Distributed & Local Locking**:
   - Addons use `@lumi/module-kit`'s `withKeyLock` or `tryKeyLock`.
   - Namespaced with pattern `${ModuleName}:lock:...` (e.g., `booster-roles:lock:role:${guildId}:${roleId}`).
   - When Redis is in cluster/distributed mode, uses Redis lock primitives; falls back to an in-memory queue (`acquireLocal`) for single-instance environments.

3. **Rate Limiting & Debouncing via Cache**:
   - Redis `setNx` with TTL is used to throttle operations without DB churn:
     - `thread-cleaner` debounces thread extension writes via a 60-second Redis key (`thread-cleaner:extend:${guildId}:${threadId}`).
     - `activity-roles` and `multi-lounge` use lock keys on sweep tasks to prevent multi-shard task overlap.
     - `economy-games` uses distributed `setNx` timestamps for cooldown tracking.

4. **Zero Raw Embeds / Components V2**:
   - Embed construction is forbidden; all cards are built using `@lumi/ui` helpers (`makeInfoCard`, `makeErrorCard`, `makeSuccessCard`, `makeWarningCard`, `makeListCard`).
   - Card replies are wrapped with `ephemeralCard()`, `cardMessage()`, or `noPingCard()`.
   - Action rows use `createPaginationRow()` with custom IDs structured as `${ModuleName}:${action}:${invokerId}:${page}`.
   - All interactive panels verify `interaction.user.id === invokerId` to prevent cross-user button tampering.

5. **Self-Healing Cron Sweeps**:
   - Asynchronous background tasks reconcile Discord state with database records. If events were dropped during Discord gateway outages or bot restarts:
     - `booster-roles` sweeps grace periods and verifies role existence.
     - `promoter` converges role assignments with member status/tags.
     - `rolementions` checks block expirations and restores role mentionability.
     - `multi-lounge` audits empty orphan voice channels.
     - `thread-cleaner` locks/archives expired threads.

---

## 4. Quality Assessment Per Addon

### 4.1 `activity-roles`
- **Strengths**: Comprehensive presence activity matching (`Playing`, `Streaming`, `Listening`, `Watching`, `Custom`, `Competing`). Clean in-memory per-member serialization queue (`reconcileQueue`) avoiding rapid presence race conditions.
- **Weaknesses**: 
  - Rules are stored in `moduleData` instead of config (`configKey` exists, but `configFields` is empty).
  - Sweep task calls `guild.members.fetch({ withPresences: true })` every 10 minutes. In large guilds (10k+ members), this can cause severe gateway and memory pressure.
  - Requires Discord Privileged Gateway Intent (`PresenceUpdate`).

### 4.2 `booster-roles`
- **Strengths**: Highest code quality in the repository. Implements full role lifecycle (naming validation, hex color normalization, sharing quotas, moderation blacklists, showcase channels, and grace periods). Robust unit tests (`roles.test.ts`).
- **Weaknesses**:
  - Overly complex permit resolution: duplicates permit checks inside command handlers rather than relying on framework-level command dispatch.
  - Role positioning logic (`anchorRoleId`) can fail if bot role hierarchy is altered by server admins without updating bot configuration.

### 4.3 `confessions`
- **Strengths**: Outstanding privacy engineering. Employs irreversible per-guild salted SHA-256 hashes (`hashAuthor(salt, userId)`). Mod actions (bans/cooldowns) operate strictly on hashes, ensuring admins cannot deanonymize users. SSRF-safe image upload pipeline downloading Discord attachments and verifying binary image MIME types.
- **Weaknesses**:
  - If a moderator manually deletes a confession message or thread in Discord, no event listener cleans up the DB references, leading to orphaned index records.

### 4.4 `dragme`
- **Strengths**: Clean, atomic claim mechanism: uses `moduleData.take` (atomic get-and-delete) to ensure two occupants cannot both click "Accept" or "Decline" on the same request.
- **Weaknesses**:
  - **Zero unit tests** (`dragme/tests/` is missing).
  - Sweep runs every minute (`* * * * *`) calling `moduleData.list({ key: PendingKey })` across all guilds. If pending requests scale, scanning key indexes every minute introduces unnecessary load.

### 4.5 `economy-games`
- **Strengths**: Rich functionality running on Lumi's transactional economy ledger. Full blackjack logic (soft/hard ace calculations, dealer rules, double downs, natural payouts), European roulette math, multi-tier crime with jail sentences, and item shop.
- **Weaknesses**:
  - Code organization: `economy-games/data.ts` is a monolithic 1,161-line file containing game math, shop parsing, stock transactions, cooldowns, and jail persistence.
  - Shop configuration: `shopItems` is stored as an escaped JSON string in config rather than structured fields, creating friction for dashboard management and error-prone JSON parsing.

### 4.6 `multi-lounge`
- **Strengths**: Elegant contiguous numbering (`nextFreeNumber`) and occupancy threshold calculations. Voice channel creation copies bitrate, permissions, and category overwrites accurately.
- **Weaknesses**:
  - Discord API rate limits: Discord strictly rate-limits voice channel creation/deletion (approx. 50 channel modifications per 10 minutes). Rapid user bounces could trip rate limits despite the creation cooldown.

### 4.7 `promoter`
- **Strengths**: Supports modern Discord Server Tags (`primaryGuild`) in addition to custom status text. Clean statistical counters and convergence pipeline.
- **Weaknesses**:
  - The `wearsServerTag` logic depends on Discord's experimental `UserPrimaryGuild` feature, which can be inconsistent or absent across discord.js gateway payloads.
  - Lacks debouncing if a user rapidly updates their custom status back and forth.

### 4.8 `rolementions`
- **Strengths**: Very effective raid/spam mitigation. Switches `mentionable: false` on ping and restores it after a timeout. Detailed daily analytics with 48h TTL.
- **Weaknesses**:
  - **Zero unit tests** (`rolementions/tests/` is missing).
  - `messageCreate` runs on *every single message* in the server. While it filters non-mentions immediately, on high-velocity servers it performs config lookups on every ping.

### 4.9 `status`
- **Strengths**: Clever solution to a fundamental platform constraint: Discord bot presence is global, but Lumi modules are per-guild. Solves this via `pickController()`, electing the guild with the most recently updated rotation.
- **Weaknesses**:
  - Bot owner commands `/status` are scoped to guilds rather than global CLI or central admin panel, meaning an owner must be in a guild with the status module enabled to change bot status.

### 4.10 `thread-cleaner`
- **Strengths**: Fully automated background moderation. Debounces inactivity extension via 60-second Redis `setNx` locks on active thread messages.
- **Weaknesses**:
  - **Zero unit tests** (`thread-cleaner/tests/` is missing).
  - No slash command interface; users cannot inspect tracked threads or view pending cleanup queues.
  - Sweep fetches channels with `{ force: true }`, which could trigger Discord REST throttling if many threads expire concurrently.

### 4.11 `utility`
- **Strengths**:
  - `/steal` has enterprise-grade SSRF security: explicit private IPv4/IPv6 blocklists, DNS resolution pinning (`requestPinned`), payload size capping (256 KB), timeout (10s), and redirect limits.
  - `/translate` provides clean mapping of 40+ natural language names to ISO language codes.
  - Test coverage for `translate.test.ts`.
- **Weaknesses**:
  - `/translate` relies on Google's unofficial GTX web endpoint (`translate.googleapis.com`). It has no API key and can be rate-limited or blocked without warning.

---

## 5. Type Safety & Code Quality Analysis

1. **Strict Compiler & Linter Compliance**:
   - `tsconfig.json` enforces:
     - `strict: true`
     - `noImplicitReturns: true`
     - `noFallthroughCasesInSwitch: true`
     - `noUnusedLocals: true`
     - `noUnusedParameters: true`
     - `noUncheckedIndexedAccess: true`
   - `biome.json` enforces `suspicious.noExplicitAny: "error"`. Across all 11 addons, there are **zero** `any` types in runtime application code. The only instances of `any` appear in tests or are explicitly cast to synthetic types via `unknown`.

2. **Non-Null Assertions (`!`)**:
   - Biome has `style.noNonNullAssertion: "off"`.
   - In production code, non-null assertions are virtually absent. Where used, they are localized to validated regex match captures or array destructuring after bounds checks.

3. **Data Deserialization & Zod Validation**:
   - Addons use Zod schemas to parse stored records from `moduleData` (e.g. `RoleRecordSchema`, `ConfigSchema`, `ThreadStateSchema`).
   - A potential issue: when reading from `moduleConfig`, if stored data fails Zod validation, addons log a warning and fall back to `ConfigSchema.parse({})`. While defensive, this silently resets user configuration to defaults on schema migration mismatches.

4. **Import Boundary Violations**:
   - `scripts/validate.ts` strictly enforces:
     - All relative imports must end with `.js` (ESM module resolution under Bun).
     - Relative imports cannot escape the addon folder.
     - Bare imports are restricted to: `@lumi/module-kit`, `@lumi/foundation`, `@lumi/ui`, `discord.js`, `zod`, `node:*`, `bun:*`.
     - Direct imports from sibling addons, `@lumi/db`, `ioredis`, `@prisma/client`, or `@lumi/module-runtime` are blocked by linter rules.

---

## 6. Missing Functionality & Technical Debt

1. **Test Coverage Gaps**:
   - 3 of the 11 addons have **no unit tests whatsoever**:
     - `dragme` (missing request claim and timeout tests)
     - `rolementions` (missing auto-block duration and analytics calculation tests)
     - `thread-cleaner` (missing inactivity math and debounce tests)
   - Existing tests focus purely on leaf utility functions (`hash.test.ts`, `logic.test.ts`, `roles.test.ts`, `lounge.test.ts`, `translate.test.ts`). Integration tests with mocked `ModuleServices` are non-existent.

2. **Dual Config Definitions (Zod Schema vs. Manifest Fields)**:
   - Every addon defines configuration twice:
     - In `manifest.json`: UI metadata (`label`, `type`, `description`, `min`, `max`, `channelTypes`).
     - In `config.ts`: Zod schema (`z.string()`, `z.number()`, defaults).
   - This duplication allows schema drift. There is no automated verification ensuring that manifest fields match Zod keys and default values.

3. **Permission Check Fragmentation**:
   - Addon commands use three conflicting methods to check permissions:
     1. Framework declaration: `requiredPermit: "mod.*"` on `CommandDefinition`.
     2. Manual permit check: `services.permits.explainPermit(...)` inside `execute()`.
     3. Discord native permission check: `interaction.memberPermissions?.has(PermissionFlagsBits.Manage...)`.
   - In a rewrite, permission resolution should be declarative on `CommandDefinition` and executed centrally by the router.

4. **Monolithic Data Layers**:
   - `economy-games/data.ts` (1,161 lines) combines card deck generation, game algorithms, crime outcomes, shop stock locks, and inventory mutations.
   - `booster-roles/roles.ts` (721 lines) mixes Discord role management with business logic.
   - Domain logic should be separated from Discord API adapters.

5. **In-Memory Caches in Multi-Shard / Multi-Instance Deployments**:
   - `activity-roles` keeps an in-memory `ruleCache` (`Map<string, RuleCacheEntry>`).
   - `economy-games` keeps `LocalCooldowns` (`Map<string, number>`).
   - If Lumi runs with multiple shards or clustered instances, local memory caches diverge unless Redis keys are used consistently.

---

## 7. How Addons Are Loaded by Lumi v2

The lifecycle of an addon from discovery to execution is orchestrated across three Lumi v2 packages: `@lumi/downloader`, `@lumi/module-runtime`, and `@lumi/module-kit`.

```
┌───────────────────────┐
│   Git Repositories    │ (e.g. lumi-addons)
└───────────┬───────────┘
            │ git clone / pull
            ▼
┌───────────────────────┐
│  @lumi/downloader     │ data/repos/<repo>/<module>
│  (Addon Manager)      │  -> Staging -> Validation -> Commit
└───────────┬───────────┘
            │ materializes flat folder
            ▼
┌───────────────────────┐
│  data/addons/<name>   │ (Local development symlinks via scripts/link.sh)
└───────────┬───────────┘
            │ discover() & loadAll()
            ▼
┌───────────────────────┐
│ @lumi/module-runtime  │ Validates manifest.json -> Imports index.ts
│   (ModuleLoader)      │ Resolves dependencies -> Topological sort -> onLoad()
└───────────┬───────────┘
            │ mounts commands, listeners, tasks
            ▼
┌───────────────────────┐
│   Lumi v2 Bot Host    │ InteractionRouter / EventDispatcher / DistributedScheduler
└───────────────────────┘
```

### 7.1 Discovery (`ModuleLoader.discover`)
1. `ModuleLoader` in `packages/module-runtime/src/loader.ts` is configured with two root search paths:
   - `modules/` (bundled modules; can be nested in category folders up to 4 levels deep).
   - `data/addons/` (downloaded or linked addons; **must be strictly flat** direct children).
2. For each directory, it reads `manifest.json` and runs `validateManifest()`:
   - Validates `apiVersion === 2`.
   - Ensures `name` matches the directory name.
   - Verifies entry file existence (resolving symlinks with `realpath` to prevent directory traversal attacks).
3. Reads the entrypoint via dynamic import with a generation cache buster:
   ```typescript
   const mod = await import(`${entryPath}?v=${importGeneration}`);
   const definition = mod.default;
   ```
4. Validates that `definition.name === manifest.name`.

### 7.2 Dependency Resolution & Topological Sort
1. `ModuleLoader.sortModules()` evaluates `manifest.dependencies`.
2. Computes an in-degree dependency graph and topological sort using Kahn's algorithm.
3. Detects dependency cycles, conflicts (`manifest.conflicts`), and missing/unsatisfied semver dependencies, rejecting unresolvable modules before initialization.

### 7.3 Lifecycle Mounting (`loadAll`)
1. Instantiates a scoped `ModuleServices` for the module:
   - Attaches `services.moduleName = name`.
   - Injects `services.data = createScopedDataStore(helpers.moduleData, name)`.
2. Calls `definition.onLoad(moduleServices)`:
   - Module initializes internal state, registers disposers.
   - Returns `Disposer[]` which are tracked for teardown.
3. Registers definitions with the host runtime:
   - `commands`: Registered in the `CommandRegistry` for slash command sync and dispatch.
   - `listeners`: Bound to Discord client events.
   - `tasks`: Registered with `DistributedScheduler` or the cron task runner.
   - `permitNodes`: Ingested into the permissions tree.

### 7.4 Installation & Downloader Integration (`@lumi/downloader`)
For dynamic production installs:
1. An admin adds a git repository via `/lumi` or the Web Dashboard.
2. `@lumi/downloader` clones/fetches the repo into `data/repos/<repoName>`.
3. When `/lumi addon install <name>` is triggered:
   - Staging: Copies module files to a temporary staging folder.
   - Validation: Runs `validateAddon()` (manifest check, import boundary checks, syntax checks).
   - Requirement installation: If `manifest.requirements` contains npm packages, installs them into the staging directory.
   - Commit: Atomically moves staging directory to `data/addons/<name>`.
   - Database record: Creates `DownloaderModule` record in Postgres via Prisma.
   - Dynamic Mount: Calls `host.mount(name)` to load and register the addon immediately without bot reboot.

---

## 8. Summary for Lumi v2 Clean Rewrite

When designing the clean rewrite of Lumi v2 and its addon ecosystem:
1. **Unify Configuration**: Generate Zod schemas directly from `manifest.json` or vice-versa to eliminate dual-source drift.
2. **Standardize Permits**: Enforce permits declaratively on `CommandDefinition.requiredPermit` at the host level; eliminate manual `explainPermit` boilerplate inside commands.
3. **Decouple Game & Domain Logic**: Isolate Discord interaction cards from core game mechanics and business logic so all algorithms can be 100% unit tested without Discord mocks.
4. **Mandate Test Suites**: Add CI quality gates requiring test files for all addons (resolving test absence in `dragme`, `rolementions`, and `thread-cleaner`).
5. **Scale Background Sweeps**: Avoid uncapped `guild.members.fetch({ withPresences: true })` and channel fetches in cron jobs; enforce batching and queue-based pagination.
