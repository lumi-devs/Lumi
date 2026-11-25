# Codebase Reconnaissance Report: Core Source Directories (`src/`)

**Target Directory:** `/home/rebiz/opt/workdir/lumi-v2/src/`  
**Scope:** Root entry point (`src/index.ts`), Core Engine (`src/core/`), and Admin Subsystem (`src/admin/`). *(Excludes `apps/dashboard`)*  
**Date:** 2026-11-25  
**Auditor:** omp's trusted coding assistant

---

## Executive Summary

The `src/` directory forms the runtime brain of the Lumi v2 Discord bot. It contains **53 source files** split across the root entry point, `src/core/` (28 files), and `src/admin/` (24 files).

While the codebase exhibits strong TypeScript discipline (strict mode enabled, **zero `any` type declarations**, zero `@ts-ignore` comments, and robust DB retry loops), it suffers from **severe structural and architectural issues** that impede clean modularity:
1. **Circular Cross-Layer Coupling:** `src/core` and `src/admin` are deeply circular. Core services instantiate Admin classes, while Admin panels and commands import Core contracts.
2. **Downward Dependency Inversion Violations:** Core and Admin code directly import internal files of downstream business modules (`modules/utility/tempvc/admin.js`, `modules/roles/autorole/admin.js`, `modules/roles/voiceroles/admin.js`, `modules/role-menus/menu/admin.js`, and `modules/shared/backup-store/index.js`).
3. **Monolithic Service Locator:** The `BotServices` interface passes 14 disparate subsystem references everywhere, causing cyclic initialization hacks (`addons: null as unknown as AddonManager`).
4. **Ad-Hoc Duck-Typed Interaction Shims:** Legacy text-prefix handling manually reconstructs Discord.js interaction objects with ~170 lines of synthetic duck-typing, cast via `as never`.
5. **Triple Implementation Duplication:** Core authorization functions (notably `isBotOwner`) and configuration defaults (`DEFAULT_PREFIX`) are duplicated or desynchronized across multiple files.

---

## 1. Exhaustive Inventory of Core Modules & Responsibilities

### 1.1 Root Entry Point
* **`src/index.ts` (282 lines)**
  * **Responsibility:** Application bootstrapping and composition root.
  * **Lifecycle Flow:**
    1. Connects to Redis (`createRedisClient`) and PostgreSQL (`connectDatabase`).
    2. Initializes `Discord.js` client (`createClient`).
    3. Assembles `CoreServices` (Redis cache, DB helpers, InvalidationBus, PermitRepository, ConfigService, DistributedScheduler, HealthMonitor).
    4. Registers uncaught exception and unhandled rejection handlers hooked to `ErrorStore`.
    5. Registers health checks for DB (`SELECT 1`), Redis status, and Discord gateway.
    6. Configures `ModuleLoader` with bundled (`modules/`) and addon (`data/addons/`) roots.
    7. Creates `CommandRegistry`, `CommandSync`, `ModuleManager`, and `GuildSync`.
    8. Assembles the `BotServices` service locator.
    9. Creates `ModuleHost` and `AddonManager`.
    10. Starts internal HTTP RPC server (`createRpcServer` / `createRpcRouter`) on `RPC_HTTP_HOST`:`RPC_HTTP_PORT`.
    11. Starts Prometheus metrics server on `METRICS_PORT` (`9090`).
    12. Schedules addon auto-updater via cron (`* * * * *`).
    13. Registers static commands (`moduleCommands`, `/about`, `/ping`, `/help`, `/owner`).
    14. Discovers and loads all modules via `host.load(...)`.
    15. Binds Discord gateway events via `registerClientEvents(...)`.
    16. Logs in to Discord (`boot`).
    17. Registers graceful shutdown handlers for SIGINT/SIGTERM.

---

### 1.2 Core Subsystem (`src/core/`)

| File | Lines | Primary Responsibilities |
|---|---|---|
| `about.ts` | 134 | Slash command `/about`. Computes process uptime, OS uptime, RAM, PostgreSQL & Redis engine versions, shard statistics, and generates OAuth2 bot invite URL. |
| `addonNotify.ts` | 27 | Implements `AddonNotifier`. Sends formatted DM notifications (success/failure cards) to bot owners on background addon auto-updates. |
| `blacklist.ts` | 68 | Data-access layer for guild and user blacklisting. Caches blacklisted status in Redis (`blacklist:guild:<id>`, `blacklist:user:<id>`) with 60s TTL over Prisma models. |
| `clientEvents.ts` | 91 | Binds Discord.js gateway events: `interactionCreate` (routes to `handleInteraction`), `messageCreate` (routes to `handlePrefixMessage`), `guildCreate`, `guildDelete`, and `clientReady`. |
| `commandSync.ts` | 84 | Manages synchronization of Discord application commands per guild. Debounces requests with a 5s cooldown (`MinSyncIntervalMs`) and pending promise coalescing. Syncs global guilds in batches of 10. |
| `commands.ts` | 207 | Slash command `/ping` and shard pagination button handler (`handlePingButton`). Displays gateway WebSocket ping, database roundtrip query latency, Redis cache hit ratio, and shard status grid. |
| `contracts.ts` | 38 | Defines the central `BotServices` dependency injection contract holding 14 subsystem references. |
| `dataLifecycle.ts` | 114 | Privacy & GDPR compliance engine (`createDataLifecycleService`). Traverses loaded modules implementing `ModuleDataLifecycle` to export or anonymize/delete user data. |
| `dispatch.ts` | 517 | Central Discord interaction dispatcher. Routes slash commands, autocompletions, buttons, select menus, and modals. Enforces blacklists, bot ownership, admin rights, permission nodes, panic locks, cooldowns, and concurrency mutexes. Records failures to `ErrorStore`. |
| `errorStore.ts` | 89 | Redis-backed error tracing store (`createErrorStore`). Records errors with UUID trace IDs, source tags, metadata, and stack traces. Maintains recent 200 error list (`lumi:errors:recent`) with 7-day TTL. |
| `errors.ts` | 74 | User-facing error message formatter (`commandErrorCard`). Maps Discord REST error codes, HTTP statuses (500, 502, 503, 504), and `AbortError` to UI cards displaying the trace ID. |
| `gateway.ts` | 30 | Discord client factory (`createClient`). Configures required Gateway Intents (11 intents including `MessageContent`, `GuildMembers`, `GuildModeration`) and Partials. |
| `guildSync.ts` | 75 | Reconciles Discord guilds in PostgreSQL on join or ready. Upserts guild records, seeds default built-in permits, and reconciles enabled/disabled module states from `guildModule` DB table into `ModuleLoader`. |
| `help.ts` | 91 | Slash command `/help`. Dynamically evaluates caller permissions against all registered slash commands (filtering out commands the user lacks permits/admin rights for) and formats commands grouped by module. |
| `index.ts` | 30 | Barrel export file for core. Exports lifecycle, commands, dispatch, services, RPC, and utilities. |
| `lifecycle.ts` | 24 | Application lifecycle triggers: `boot(client, token)` (attaches ready/error listeners and executes `client.login`) and `shutdown(client)` (`client.destroy()`). |
| `locks.ts` | 14 | Redis panic-lock checker (`isModuleLocked`). Determines if a module is frozen by a security lock. |
| `moduleConfig.ts` | 22 | Adapter pattern wrapping `ConfigService` to satisfy the `ModuleConfigService` contract defined in `@lumi/module-kit`. |
| `modules.ts` | 347 | Module hosting infrastructure: `CommandRegistry` (stores commands, manages aliases, produces Discord API registration payloads) and `ModuleHost` (wires module listeners and scheduled cron tasks to runtime, handles module reload/unload). |
| `owner.ts` | 11 | Bot owner resolver. Parses `process.env.OWNER_IDS` and exports `isBotOwner(userId)`. |
| `ownerCommands.ts` | 497 | Slash command `/owner`. Subcommands for data privacy export/delete, guild listing/leaving, guild/user blacklisting, config export/import, recent error list/trace viewing, and module hot-reloading (`/owner reload`). |
| `prefix.ts` | 476 | Legacy text-message prefix command dispatcher (`handlePrefixMessage`). Parses prefixes, mentions, subcommands, and flags; constructs a synthetic Discord interaction shim; evaluates authorization; and executes the command. |
| `redis.ts` | 35 | Parses Redis connection configuration from `REDIS_URL` or individual `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` environment variables. |
| `rpc.ts` | 55 | Lightweight HTTP control server wrapper (`createRpcServer`) around Node's `node:http`. |
| `rpcRouter.ts` | 89 | Request router for internal HTTP RPC API (`createRpcRouter`). Maps HTTP paths to route handlers with timing and metric tracking. |
| `rpcRoutes.ts` | 685 | RPC route implementations: `/healthz`, `/ready`, `/api/v1/status`, `/api/v1/permits/nodes`, `/api/v1/guilds/:id`, `/api/v1/addons/*`, `/api/v1/guilds/:id/modules/*`, `/api/v1/guilds/:id/config/*`, and `/api/v1/guilds/:id/backups/*`. |
| `services.ts` | 67 | Factory `createCoreServices` initializing Redis cache namespaces, DB helpers, InvalidationBus, PermitRepository, ConfigService, DistributedScheduler, and HealthMonitor. |
| `shutdown.ts` | 32 | Process signal handler (`registerShutdownHandlers`). Listens for `SIGINT`/`SIGTERM` and runs registered teardown tasks sequentially. |

---

### 1.3 Admin Subsystem (`src/admin/`)

| File | Lines | Primary Responsibilities |
|---|---|---|
| `access.ts` | 68 | Admin permission evaluator (`hasAdminAccess`, `hasPermitAccess`). Checks permit enforcement toggle; delegates to `PermitRepository.explainPermit` for `admin.*` or falls back to native `ManageGuild` permission. |
| `index.ts` | 8 | Barrel export file for admin services, panels, commands, and access helpers. |
| `commands/index.ts` | 74 | Admin slash commands: `/lumi` (opens Admin Hub), `/config` (opens module configuration), and re-exports `permitCommand`. |
| `commands/permit.ts` | 92 | Slash command `/permit` with subcommands `create` and `explain`. |
| `commands/permit/autocomplete.ts` | 63 | Autocomplete provider for permission nodes in `/permit` commands. |
| `commands/permit/create.ts` | 136 | Command executor for `/permit create`. Validates nodes, polarity, security whitelist scopes, and uniqueness. |
| `commands/permit/explain.ts` | 95 | Command executor for `/permit explain`. Runs permission evaluation for a specific user and displays detailed audit logs. |
| `commands/permit/shared.ts` | 24 | Error card response helper and "Open Permits" UI row for permit commands. |
| `panel/HubPanel.ts` | 213 | Top-level Discord UI interaction router for `/lumi`. Routes custom IDs (`lumi:<action>:...`) to tabs (Home, Modules, Settings, Permits, Add-ons, Roles, TempVC). |
| `panel/common.ts` | 139 | Common UI constants, navigation tabs, breadcrumb generator, modal submit types, and panel update helper (`showPanel`). |
| `panel/hubViews.ts` | 196 | Renderers for Admin Hub main tabs: Home dashboard, Server Settings, and Permits overview. |
| `panel/moduleList.ts` | 120 | Renderers for the Modules tab. Lists bundled modules with enabled/disabled badges and pagination. |
| `panel/modules.ts` | 24 | Helpers for sorting, categorizing, and filtering bundled module metadata. |
| `panel/pages.ts` | 27 | Generic array pagination utility (`pagesOf`, `paginate`). |
| `panel/moduleActions.ts` | 488 | Interaction router for module-level toggles, resets, section switching, and modal settings triggers. Delegates to module-specific handlers. |
| `panel/moduleSettings.ts` | 536 | View renderer and modal builder for module configuration fields (boolean, string, number, channel, role, select, escalation, json). |
| `panel/configFields.ts` | 41 | Categorizes and paginates module `ConfigField` definitions into tabs/pages. |
| `panel/escalation.ts` | 332 | Moderation escalation rule manager (e.g., 3 infractions = timeout, 5 = kick). Handles UI rendering, modal input, serialization, and validation. |
| `panel/addons.ts` | 276 | Interaction handler for the Add-ons manager UI (add repo, update repo, browse modules, install/uninstall, toggle auto-update). |
| `panel/addonViews.ts` | 581 | View renderers and modal builders for Add-ons UI (repo listing, module catalog, installed status, interval selector). |
| `panel/PermitPanel.ts` | 202 | Main controller class for interactive permit management in Discord UI. Coordinates views, flows, and DB operations. |
| `panel/permit/host.ts` | 64 | Interface definitions (`PermitHost`, `PermitCardContext`) decoupling the PermitPanel controller from card renderers. |
| `panel/permit/listViews.ts` | 241 | Card renderers for listing permits with pagination and permit priority reordering. |
| `panel/permit/listActions.ts` | 141 | Action handlers for permit list pagination, viewing permit details, and moving priority up/down. |
| `panel/permit/detailViews.ts` | 254 | Card renderers for permit details, assignments list, unassignment picker, and deletion confirmation. |
| `panel/permit/createView.ts` | 137 | Multi-step permit creation wizard card renderer (namespace selector, node checkboxes, polarity toggle). |
| `panel/permit/createActions.ts` | 250 | Action handlers and modal submit handler for the permit creation wizard. |
| `panel/permit/assignViews.ts` | 188 | Card renderers for assigning a permit to a User, Role, or Channel with duration pickers (1h, 1d, 7d, 30d, never). |
| `panel/permit/assignActions.ts` | 202 | Action handlers for assigning and unassigning permits to targets. |
| `panel/permit/editDialog.ts` | 222 | Modal builder and submission processor for editing existing permit attributes. |
| `panel/permit/explainActions.ts` | 106 | Live permit explanation action handler from the UI. |
| `panel/roles/index.ts` | 3 | Re-export facade for role module admin panel actions and modals. |
| `panel/roles/actions.ts` | 22 | Role module router. Delegates actions to `autorole`, `voiceroles`, and `role-menus`. |
| `panel/roles/modals.ts` | 23 | Role modal router. Delegates submissions to `autorole`, `voiceroles`, and `role-menus`. |
| `panel/roles/shared.ts` | 129 | Shared UI helper functions and components for role configuration panels. |
| `permits/explain.ts` | 121 | Formats live permit evaluation trees into readable Discord embed explanation cards. |
| `permits/flows.ts` | 74 | In-memory temporary state manager for multi-step permit wizards (`CreateFlow`, `ExplainFlow`, `AssignFlow`). |
| `permits/format.ts` | 44 | Formatting helpers for permit attributes (timestamps, polarity icons, mentions, expiry durations). |
| `permits/nodes.ts` | 170 | Permission node catalog compiler, regex validator (`/^(\*\|[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*(\.\*)?)$/`), and node name suggester. |
| `services/ConfigService.ts` | 134 | Guild configuration data access layer. Stores settings as JSON in PostgreSQL `GuildConfig` table with Redis caching and 5-attempt concurrency retry loop for P2002/P2034 conflicts. |
| `services/ModuleManager.ts` | 36 | Manages module activation per guild in PostgreSQL `GuildModule` table, updates `ModuleLoader`, and triggers slash command sync. |

---

## 2. Module Dependency Graph & Boundary Leaks

### 2.1 The Core-to-Admin Circular Dependency
`src/core` and `src/admin` are tightly intertwined in a two-way cyclic dependency:
```
┌────────────────────────────────────────────────────────┐
│                      src/core/                         │
│  services.ts     ──────> ConfigService.ts (admin)      │
│  contracts.ts    ──────> ConfigService & ModuleManager │
│  dispatch.ts     ──────> access.ts, HubPanel, Permit   │
│  clientEvents.ts ──────> PermitPanel (admin)           │
│  help.ts         ──────> access.ts, ConfigService      │
│  prefix.ts       ──────> access.ts (admin)             │
│  ownerCommands   ──────> ConfigService (admin)         │
│  rpcRoutes.ts    ──────> nodes.ts (admin/permits)      │
└───────────────────────────▲────────────────────────────┘
                            │  Circular Dependency
┌───────────────────────────┴────────────────────────────┐
│                      src/admin/                        │
│  commands/index.ts       ──> contracts.ts (core)       │
│  commands/permit/*.ts    ──> contracts.ts (core)       │
│  panel/HubPanel.ts       ──> contracts.ts (core)       │
│  panel/moduleActions.ts  ──> contracts.ts (core)       │
│  panel/moduleSettings.ts ──> contracts.ts (core)       │
│  panel/addons.ts         ──> contracts.ts (core)       │
│  panel/roles/*.ts        ──> contracts.ts (core)       │
└────────────────────────────────────────────────────────┘
```

### 2.2 Cross-Boundary Downward Leaks (Direct Module Imports)
The core bot framework should be agnostic of specific business modules. However, because the system lacks a modular UI registration hook, the core framework directly imports private implementation files from `modules/`:

1. **`src/admin/panel/HubPanel.ts:25`**:
   ```ts
   import { handleTempVcGeneratorModal } from "../../../modules/utility/tempvc/admin.js";
   ```
2. **`src/admin/panel/moduleActions.ts:42`**:
   ```ts
   import { handleTempVcModuleAction } from "../../../modules/utility/tempvc/admin.js";
   ```
3. **`src/admin/panel/roles/actions.ts:3-5`**:
   ```ts
   import { handleAutoroleAction } from "../../../../modules/roles/autorole/admin.js";
   import { handleVoiceRolesAction } from "../../../../modules/roles/voiceroles/admin.js";
   import { handleRoleMenusAction } from "../../../../modules/role-menus/menu/admin.js";
   ```
4. **`src/admin/panel/roles/modals.ts:3-5`**:
   ```ts
   import { handleAutoroleModal } from "../../../../modules/roles/autorole/admin.js";
   import { handleVoiceRolesModal } from "../../../../modules/roles/voiceroles/admin.js";
   import { handleRoleMenusModal } from "../../../../modules/role-menus/menu/admin.js";
   ```
5. **`src/core/rpcRoutes.ts:13-16`**:
   ```ts
   import {
     type BackupRecord,
     backupStats,
     previewBackupRestore,
     restoreBackup,
     toBackupRecord,
   } from "../../modules/shared/backup-store/index.js";
   ```

*Impact:* The core cannot be built, tested, or packaged without these specific downstream modules existing in the repository.

---

## 3. Type Definitions & Type Safety Audit

### 3.1 Strictness & Discipline
* `tsconfig.json` enforces:
  * `"strict": true`
  * `"noImplicitOverride": true`
  * `"noFallthroughCasesInSwitch": true`
  * `"noUnusedLocals": true`
  * `"noUnusedParameters": true`
  * `"verbatimModuleSyntax": true`
* **Zero instances of the `any` keyword** exist in `src/` declarations.
* **Zero instances of `@ts-ignore` or `@ts-expect-error`** exist anywhere in `src/`.

### 3.2 Sloppiness & Escape Hatches

#### 1. The `syntheticInteraction as never` Escape Hatch
In `src/core/prefix.ts:443, 446`:
```ts
if (command.module === null) {
  await command.execute(syntheticInteraction as never, context.services);
} else {
  await command.execute(
    syntheticInteraction as never,
    servicesForModule(context.services, command.module),
  );
}
```
*Why:* `createSyntheticInteraction` duck-types a few methods of `ChatInputCommandInteraction` (~170 lines). Because it lacks 80%+ of the Discord.js interaction interface (`appPermissions`, `locale`, `inCachedGuild()`, `webhook`, etc.), it cannot pass type checking and forces a cast to `never`. If any command touches an unmocked property, it throws a runtime `TypeError`.

#### 2. The `MessageModalSubmit` Discord.js Typing Patch
In Discord.js, when a modal is opened from a message component (button), submitting it allows calling `.update(...)` on the message. Because Discord.js typing does not reflect this on base `ModalSubmitInteraction`, the codebase casts interactions repeatedly:
* `HubPanel.ts:197`: `await (interaction as MessageModalSubmit).update(card);`
* `moduleActions.ts:339, 371`: `await (interaction as MessageModalSubmit).update(card);`
* `roles/shared.ts:81`: `await (interaction as MessageModalSubmit).update(card);`

#### 3. Premature Casts of `unknown`
* `src/admin/access.ts:13, 43`: `options.client?: unknown` is accepted, then blindly asserted as `options.client as Client | undefined`.
* `src/core/blacklist.ts:22, 32`: Cache return types are asserted `as Promise<boolean>` instead of properly parameterized generics.
* `src/admin/services/ConfigService.ts:62`: JSON value forced as `next as Prisma.InputJsonValue`.

#### 4. Non-null Assertions (`!`)
There are over 30 non-null assertions across `src/`, particularly:
* `interaction.guildId!` in `HubPanel.ts`, `hubViews.ts`, `moduleList.ts`, `moduleSettings.ts`, `addonViews.ts`.
* `interaction.values[0]!` in select menu handlers (`addons.ts:84, 106`).
* `match[1]!` in regex path extractors (`rpcRoutes.ts:155, 176, 260`).
If any interaction occurs in DMs or with empty values, unhandled exceptions occur.

---

## 4. Error Handling & Resilience Patterns

1. **Fire-and-Forget UI Swallowing:**
   ```ts
   await interaction.reply(...).catch(() => undefined);
   await interaction.editReply(...).catch(() => undefined);
   ```
   Ubiquitous throughout `dispatch.ts`, `prefix.ts`, `commands.ts`, `help.ts`, and `about.ts`. While this prevents crashes when users dismiss cards or webhooks expire (>15 minutes), it completely discards error diagnostics for network failures and Discord permission rejections (`50001 Missing Access`).
2. **Central Error Store with Trace IDs:**
   `src/core/errorStore.ts` provides a structured error ledger. When a slash command fails:
   * The error is assigned a UUID trace ID.
   * Stored in Redis with source, user ID, guild ID, command name, and stack trace (7-day TTL).
   * Pushed to a recent 200 list (`lumi:errors:recent`).
   * `errors.ts:commandErrorCard` returns an ephemeral card displaying:
     `An unexpected error occurred.`
     `-# Trace: 4a2b9e1c-5d6f-...`
   * Owners can run `/owner errors_trace id:<traceId>` to view the full stack trace in Discord.
3. **Optimistic Concurrency Retries:**
   `ConfigService.mutate` wraps DB updates in an exponential backoff loop (up to 5 attempts) specifically targeting Prisma concurrency codes `P2002` (unique constraint) and `P2034` (transaction conflict).
4. **RPC Route Error Inconsistency:**
   In `rpcRoutes.ts`, some handlers return `{ error: string }` with HTTP 400/404/405/500, but uncaught errors in database calls often swallow the underlying error:
   ```ts
   } catch {
     finish(500, { error: "internal_error" });
   }
   ```

---

## 5. Logging Patterns

1. **Structured Logging:**
   Loggers are instantiated via `@lumi/foundation` (`createLogger`, `logger`). Expected signature:
   `logger.info(message: string, meta?: Record<string, unknown>): void`
2. **Signature Mismatch in Event Listeners:**
   In `src/core/modules.ts:257`:
   ```ts
   this.options.logger.error(
     `[${moduleName}] listener ${event} failed:`,
     error,
   );
   ```
   Passing `error` as the second argument instead of `{ error }` violates the structured logging pattern and causes loggers expecting metadata dictionaries to drop or misformat the stack trace.
3. **Fragmented Logger Interfaces:**
   * `src/core/modules.ts:40-44` defines `ModuleHostLogger`.
   * `src/core/prefix.ts:24-26` defines `PrefixLogger`.
   Instead of depending on the unified `Logger` interface from `@lumi/foundation`, duplicate sub-interfaces are declared.

---

## 6. Configuration & Dependency Injection Patterns

1. **The Monolithic `BotServices` Locator:**
   `src/core/contracts.ts` defines `BotServices`:
   ```ts
   export interface BotServices {
     readonly client: Client;
     readonly redis: Redis;
     readonly prisma: PrismaClient;
     readonly helpers: DbHelpers;
     readonly configService: ConfigService;
     readonly permits: PermitRepository;
     readonly scheduler: DistributedScheduler;
     readonly moduleLoader: ModuleLoader;
     readonly moduleManager: ModuleManager;
     readonly addons: AddonManager;
     readonly moduleConfig: ModuleConfigService;
     readonly modules: ModuleRegistryAccess;
     readonly ui: typeof Ui;
     readonly discord: { readonly PermissionFlagsBits: typeof PermissionFlagsBits };
     readonly observability: { readonly logger: Logger; readonly healthMonitor?: HealthMonitor };
   }
   ```
   *Issue:* Because `AddonManager` needs a reference to `ModuleHost`, and `ModuleHost` needs `BotServices`, and `BotServices` needs `AddonManager`, `src/index.ts:135` employs a cyclic bootstrap mutation:
   ```ts
   const services: BotServices = {
     // ...
     addons: null as unknown as AddonManager,
   };
   // ...
   (services as { addons: AddonManager }).addons = addonManager;
   ```
2. **Environment Variable Sprawl & Lack of Validation:**
   Environment variables are accessed via `process.env` ad-hoc across 10+ files without any startup validation schema:
   * `CACHE_NAMESPACE` (`core/services.ts`)
   * `RPC_HTTP_PORT`, `RPC_HTTP_HOST`, `RPC_INTERNAL_TOKEN` (`src/index.ts`)
   * `METRICS_ENABLED`, `METRICS_PORT` (`src/index.ts`)
   * `BOT_TOKEN` (`src/index.ts`)
   * `DEFAULT_PREFIX` (`core/prefix.ts`)
   * `OWNER_IDS` (`core/owner.ts`)
   * `REDIS_URL`, `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` (`core/redis.ts`)
   If `BOT_TOKEN` is missing, the application proceeds through database connection and RPC startup before crashing inside `boot()`.

---

## 7. Dead Code, Incomplete Exports & Memory Leaks

1. **Incomplete Public API in `src/core/index.ts`:**
   The barrel file `src/core/index.ts` fails to export several vital classes:
   * `CommandRegistry`, `ModuleHost`, `servicesForModule` (`modules.ts`)
   * `createCommandSync` (`commandSync.ts`)
   * `createModuleConfigService` (`moduleConfig.ts`)
   * `isModuleLocked` (`locks.ts`)
   Because of this, `src/index.ts` has to bypass the package alias `@lumi/core` and use relative path imports (`./core/commandSync.js`, `./core/modules.js`, etc.).
2. **Unbounded In-Memory Cache in `commands.ts`:**
   In `src/core/commands.ts:13`:
   ```ts
   const pingUserPages = new Map<string, number>();
   ```
   Tracks the current shard page of every user who ran `/ping`. Entries are never evicted or given a TTL. On a high-traffic bot, this map leaks memory indefinitely.
3. **In-Memory Permit Wizard State in `flows.ts`:**
   `src/admin/permits/flows.ts:32` stores active permit creation wizards in an in-memory `Map<string, StoredFlow>`. If the bot restarts or runs with multiple shard instances, multi-step permit wizards in progress immediately break.
4. **Redundant Module File:**
   `src/admin/panel/modules.ts` (24 lines) contains only `ModulesPerPage = 4` and `moduleItems()`. It serves no purpose that isn't already handled in `moduleList.ts`.

---

## 8. Backwards Compatibility Shims & Re-exports

1. **Pass-Through Logger Re-exports:**
   `src/core/index.ts:1-6` re-exports `createLogger`, `errorMessage`, `type Logger`, and `logger` from `@lumi/foundation`. This introduces ambiguity about whether packages should import logging from `@lumi/core` or `@lumi/foundation`.
2. **Prefix Interaction Emulation Shim:**
   `src/core/prefix.ts` exists purely as a backwards-compatibility layer for text prefix commands (`!help`, `,ping`). It hacks around Discord's component interaction design by intercepting `messageCreate`, stripping ephemeral flags (`(card.flags ?? 32768) & ~64`), and constructing an artificial interaction.
3. **Triplicate Module Enablement Checking:**
   * `services.modules.isEnabled(guildId, moduleName)`
   * `services.moduleLoader.isEnabled(guildId, moduleName)`
   * `services.moduleLoader.isActive(guildId, moduleName)`
   `isActive` checks if the module is loaded globally *and* enabled in the guild, while `isEnabled` only checks the database flag. Various files use different calls, creating subtle permission and autocompletion bugs.

---

## 9. Naming & Design Inconsistencies

1. **`isBotOwner` Implemented in 3 Different Places:**
   * `src/core/owner.ts:8`
   * `packages/permits/src/evaluator.ts:287`
   * `apps/dashboard/src/lib/server/permissions.ts:9`
   Files inside `src/admin` arbitrarily import `isBotOwner` from `@lumi/permits`, while files in `src/core` import it from `./owner.js`.
2. **Desynchronized Default Prefix:**
   * `src/core/prefix.ts`: `process.env.DEFAULT_PREFIX ?? ","`
   * `src/admin/panel/hubViews.ts:21`: `const DefaultPrefix = ","`
   * `src/admin/panel/moduleSettings.ts:34`: `const DefaultPrefix = ","`
   If `DEFAULT_PREFIX` is customized in `.env`, prefix commands obey it, but the Admin Hub UI views hardcode and display `","`.
3. **Interaction Custom ID Inconsistencies:**
   * Admin Hub: `lumi:<action>:<target>:<extra>` (colon-separated)
   * Permit Panel: `permit_<action>:<id>` (mixture of underscore and colon)
   * Shard Ping: `ping:page:<page>:<userId>`
4. **File Naming Conventions:**
   * PascalCase files: `ConfigService.ts`, `ModuleManager.ts`, `HubPanel.ts`, `PermitPanel.ts`.
   * camelCase files: `commandSync.ts`, `clientEvents.ts`, `moduleActions.ts`, `moduleSettings.ts`, `dataLifecycle.ts`.
   * Class definitions are inconsistently organized: `ConfigService` and `PermitPanel` have dedicated PascalCase files, while `CommandRegistry` and `ModuleHost` are housed inside `modules.ts`.
5. **Permit Polarity Inconsistency:**
   * Data storage and UI options use PascalCase: `"Grant" | "Deny"`.
   * Evaluation engine results use lowercase: `"allow" | "deny" | "pass"`.

---

## 10. Architectural Recommendations for Rewrite

1. **Establish Strict Directional Layers:**
   * **Level 0 (Foundation):** Logging, errors, primitives (`@lumi/foundation`, `@lumi/ui`).
   * **Level 1 (Data & Infrastructure):** Database (`@lumi/db`), Redis (`@lumi/redis`), Cache (`@lumi/cache`), Scheduler.
   * **Level 2 (Core Engine):** Gateway client, Command registry, Dispatcher, Permissions evaluator, Module loader.
   * **Level 3 (Application / Services):** ConfigService, ModuleManager, ErrorStore, RPC routes.
   * **Level 4 (Admin UI & Modules):** Discord Admin panels, slash commands, bundled modules, external addons.
   * *Rule:* Never import Level 4 from Level 2 or 3.
2. **Plugin Extension Points for Admin UI & RPC:**
   Replace the hardcoded imports in `HubPanel.ts`, `moduleActions.ts`, and `rpcRoutes.ts` with a formal plugin contribution API on `ModuleDefinition`:
   ```ts
   export interface ModuleDefinition {
     // ...
     adminPanels?: AdminPanelContributor[];
     modalHandlers?: ModalHandlerContributor[];
     backupProviders?: BackupProviderContributor;
   }
   ```
3. **Replace Monolithic `BotServices` with Real Dependency Injection:**
   Eliminate the 14-field bag of services and the cyclic `addons: null as unknown as AddonManager` mutation. Pass only the required dependencies to component constructors or command factories.
4. **Centralized Environment Schema Validation:**
   Introduce a Zod-validated environment config object at application boot in `src/index.ts`. Validate `BOT_TOKEN`, `REDIS_URL`, `DATABASE_URL`, `OWNER_IDS`, and `DEFAULT_PREFIX` before connecting to external services.
5. **Deprecate or Formalize Prefix Support:**
   If text-based prefix commands are retained, replace the fragile 170-line `createSyntheticInteraction` duck-typing with an adapter that implements a clean, unified internal `CommandContext` shared by both slash commands and prefix commands.

---
*Report completed. Ready for review and integration by coordinator.*