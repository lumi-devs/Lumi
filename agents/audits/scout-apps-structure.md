# Scout Report: Application Architecture & Sub-App Structure

**Target Directory:** `/home/rebiz/opt/workdir/lumi-v2/apps/`  
**Scope:** Monorepo sub-applications, inter-app dependencies, boot lifecycle, shared code, anti-patterns, tech debt, and clean rewrite blueprint.  
**Date:** 2026-11-25  

---

## Table of Contents
1. [Executive Summary & Monorepo Sub-App Inventory](#1-executive-summary--monorepo-sub-app-inventory)
2. [Application Catalog & Core Responsibilities](#2-application-catalog--core-responsibilities)
3. [Inter-App Communication & Dependency Graph](#3-inter-app-communication--dependency-graph)
4. [Entry Points & Boot Sequences](#4-entry-points--boot-sequences)
5. [Shared Code & Cross-Boundary Couplings](#5-shared-code--cross-boundary-couplings)
6. [Dead Code, Abandoned Features & Historical Apps](#6-dead-code-abandoned-features--historical-apps)
7. [Anti-Patterns & Architectural Flaws](#7-anti-patterns--architectural-flaws)
8. [Backwards Compatibility Shims & Fallbacks](#8-backwards-compatibility-shims--fallbacks)
9. [Detailed Route & Component Audit](#9-detailed-route--component-audit)
10. [Rewrite & Modernization Blueprint](#10-rewrite--modernization-blueprint)

---

## 1. Executive Summary & Monorepo Sub-App Inventory

The `apps/` directory within `lumi-v2` is configured via Bun workspaces (`package.json` -> `"workspaces": ["packages/*", "apps/*"]`). Currently, `apps/` contains a single active sub-application:
- **`@lumi/dashboard`** (`apps/dashboard`): A full-stack web application built on **SvelteKit 5** and deployed via `@sveltejs/adapter-node` on port `4173`.

Its companion application residing at the repository root is:
- **`lumi-v2` Bot Core** (`src/index.ts`): The Discord Gateway client, module host, command runner, RPC server (`127.0.0.1:8091`), and Prometheus metrics exporter (`9090`).

Historical analysis reveals that a second sub-app, **`apps/worker`**, previously existed in earlier iterations of the repository (found in historical conflict preimage artifacts in `.git/rr-cache/c320afa6d7b0ca8eff0c04db9f072fa043d2688e/preimage`). Its background job and cron responsibilities were merged directly into the bot process via `@lumi/cron` and `@lumi/scheduler`.

```
+------------------------------------------------------------------------------------------------+
|                                          MONOREPO ROOT                                         |
|                                                                                                |
|  +--------------------------------+                  +--------------------------------------+  |
|  |     apps/dashboard             |                  |       src/index.ts (Bot Core)        |  |
|  |  - SvelteKit 5 (adapter-node)  |                  |  - Discord.js Gateway Client         |  |
|  |  - Port 4173                   |                  |  - Module Host & Runtime             |  |
|  |  - Web UI, OAuth2, Captcha     |                  |  - RPC Server (port 8091)            |  |
|  |  - Direct DB & Redis Access    |                  |  - Prometheus Metrics (port 9090)    |  |
|  +--------------------------------+                  +--------------------------------------+  |
|                  \                                                    /                        |
|                   \              +--------------------+              /                         |
|                    +-----------> |   Shared Redis     | <-----------+                          |
|                    |             +--------------------+             |                          |
|                    |             +--------------------+             |                          |
|                    +-----------> |  Shared PostgreSQL | <-----------+                          |
|                    |             +--------------------+             |                          |
|                    v                                                v                          |
|       Direct Discord REST API                          Discord Gateway & REST API              |
|       (OAuth2 + Bot Token actions)                     (Gateway events + slash commands)       |
+------------------------------------------------------------------------------------------------+
```

---

## 2. Application Catalog & Core Responsibilities

### 2.1 Sub-App: `@lumi/dashboard` (`apps/dashboard`)
- **Framework:** SvelteKit 5 (v5.59.1) with `@sveltejs/kit` (v3.4.0) and `@sveltejs/adapter-node` (v6.0.5).
- **Runtime:** Bun 1.4.4 running containerized under Alpine Linux with `tini` as init process.
- **Primary Purpose:** Provide an administrative and self-service management interface for Discord server owners and staff. Allows configuration of server-level settings, moderation modules, RBAC permits, custom role menus, ticketing panels, backups, panic mode, security verification, and add-on management.
- **Public Surface:**
  - Landing / OAuth redirect page: `/`
  - Guild selector: `/guilds`
  - Guild management overview: `/guilds/[guildId]`
  - Guild modules catalog & toggles: `/guilds/[guildId]/modules`
  - Deep module configuration: `/guilds/[guildId]/modules/[module]`
  - Features (Role menus & Tickets): `/guilds/[guildId]/features`
  - RBAC Permit management: `/guilds/[guildId]/permits` and `/guilds/[guildId]/permits/[permitId]`
  - Security & Panic: `/guilds/[guildId]/security`
  - Audit log & Cases: `/guilds/[guildId]/cases`
  - Analytics & Snapshots: `/guilds/[guildId]/stats`
  - Add-on repository & package manager: `/guilds/[guildId]/addons`
  - Public user web verification: `/verify/[token]` (unauthenticated, math captcha + rate limit)
  - System health probe: `/healthz`
  - OAuth2 handshake: `/auth/login`, `/auth/callback`, `/auth/logout`

### 2.2 Peer Application: `lumi-v2` Core Bot (`src/index.ts`)
- **Framework:** Discord.js v14.28.1 on Bun.
- **Primary Purpose:** Connects to the Discord Gateway, listens for member/message/guild events, executes slash commands, schedules recurring tasks, mounts modules (bundled and external add-ons), enforces permit trees, runs cron sweeps, and serves an internal RPC HTTP API for the dashboard.

### 2.3 Historical Predecessor: `apps/worker`
- **Status:** **Dead / Absorbed**.
- **History:** Artifacts show `/apps/worker/data/` was tracked in `.gitignore` prior to branch convergence. In earlier architecture, long-running tasks, cron schedules, and backup archiving were intended to live in a dedicated worker process. These duties were collapsed into the main bot process (`src/core/scheduler.ts` and `@lumi/cron`), leaving `dashboard` as the sole occupant of `apps/`.

---

## 3. Inter-App Communication & Dependency Graph

The dashboard does not communicate with the bot via a single, well-isolated abstraction layer. Instead, it relies on a **three-way split architecture**:

```
                      +----------------------------+
                      |       @lumi/dashboard      |
                      +----------------------------+
                         /          |           \
       (1) HTTP RPC     /   (2) DB  |            \  (3) Redis
       Port 8091       /   Shared   |             \  Direct keys
                      v    Postgres v              v
          +--------------+   +---------------+   +------------+
          |  Bot RPC API |   |  PostgreSQL   |   |   Redis    |
          +--------------+   +---------------+   +------------+
                 |                  ^                  ^
                 |                  |                  |
                 +------------------+------------------+
                                    |
                          +-------------------+
                          |    Bot Core       |
                          +-------------------+
```

### 3.1 Channel 1: Bot Internal RPC API (`apps/dashboard/src/lib/server/rpc.ts`)
- **Endpoint Configuration:** Configured via `RPC_URL` (default `http://127.0.0.1:8091`) and secured via `RPC_INTERNAL_TOKEN` (`Bearer <token>`).
- **Bound Host Verification:** The bot enforces that if `RPC_HTTP_HOST` is bound to anything other than loopback (`127.0.0.1`, `localhost`, `::1`), `RPC_INTERNAL_TOKEN` is mandatory (`src/index.ts:168-172`).
- **Implemented RPC Endpoints:**
  - `GET /api/v1/permits/nodes?guild_id=<id>`: Retrieves the dynamic catalog of valid permission nodes exposed by currently active modules.
  - `GET /api/v1/guilds/<id>/modules`: Retrieves the live module catalog, metadata, schema definitions, origins (`bundled` vs `addon`), and enabled state.
  - `POST /api/v1/guilds/<id>/modules/<module>/state`: Notifies the bot to enable/disable a module in memory and re-sync guild commands.
  - `POST /api/v1/guilds/<id>/config/invalidate`: Signals the bot's `TieredCache` / `ConfigService` to invalidate its cached configuration for a guild.
  - `GET /api/v1/guilds/<id>/backups/<backupId>/preview`: Compares a stored backup against live Discord state to produce a diff of roles, channels, and permission overwrites.
  - `POST /api/v1/guilds/<id>/backups/<backupId>/restore`: Triggers the bot to materialize the backup onto the Discord guild.
  - `GET /api/v1/addons`: Lists tracked add-on git repositories, candidate modules, and installed modules.
  - `POST /api/v1/addons/repos`: Adds and clones an add-on git repository.
  - `DELETE /api/v1/addons/repos/<name>`: Unlinks and removes an add-on git repository.
  - `POST /api/v1/addons/repos/<name>/update`: Triggers git pull and module hot-reloading.
  - `POST /api/v1/addons/install`: Installs an add-on module into `data/addons`.
  - `DELETE /api/v1/addons/modules/<name>`: Uninstalls an add-on module.
  - `POST /api/v1/addons/modules/<name>/pin`: Pins an add-on version to prevent automatic updates.

### 3.2 Channel 2: Shared PostgreSQL Database (`apps/dashboard/src/lib/server/prisma.ts`)
- Both applications connect directly to PostgreSQL using `@prisma/client` and `@prisma/adapter-pg` over `pg.Pool`.
- **Direct Writes from Dashboard:**
  - `Guild.settings`: Raw JSON blob mutated directly inside a serializable transaction (`apps/dashboard/src/lib/server/settings.ts`).
  - `GuildModule`: Upserts enabled/disabled state per guild.
  - `Permit` & `PermitAssignment`: Creates, edits, and deletes RBAC permits.
  - `AuditLog`: Writes dashboard administrative audit records directly to the bot's audit log table.
  - `RoleMenuGroup`, `RoleMenuOption`: Configures interactive role menus.
  - `TicketCategory`, `TicketPanel`: Configures ticketing system structures.
  - `VerificationToken`: Single-use tokens for web verification.
- **Synchronization Mechanism:** After mutating `Guild.settings`, the dashboard calls RPC `invalidateGuildConfig(guildId)`. However, for entities like role menus, tickets, and permits, the dashboard writes directly to Postgres **without any RPC invalidation call**, assuming the bot queries Postgres directly or has short-lived caches.

### 3.3 Channel 3: Shared Redis Instance (`apps/dashboard/src/lib/server/redis.ts`)
- **Direct Redis Operations by Dashboard:**
  - Session records: `lumi:dashboard:session:<hmac>` (TTL 7 days, absolute max 30 days).
  - OAuth state: `lumi:dashboard:oauth:<state>` (TTL 10 minutes).
  - Captchas: `lumi:dashboard:captcha:<nonce>` (TTL 10 minutes).
  - Rate limits: `lumi:dashboard:rate:<scope>:<hash>`.
  - Invalidation Bus: Connects to `@lumi/redis` `InvalidationBus`.
  - **Direct Module State Intrusion:**
    - `apps/dashboard/src/routes/guilds/[guildId]/security/+page.server.ts` writes directly to `lumi:security:panic:<guildId>` and `lumi:lock:module:<guildId>:mod`.
    - `apps/dashboard/src/routes/verify/[token]/+page.server.ts` manually deletes `lumi:security:verification:pending:<guildId>:<userId>` and executes `SREM lumi:security:verification:pending-set:<guildId> <userId>`.

### 3.4 Channel 4: Direct Discord REST API Access (`apps/dashboard/src/lib/server/discord.ts`)
- The dashboard does not proxy all Discord operations through the bot. Instead, it maintains its own HTTP client against `https://discord.com/api/v10`:
  - **User Context (OAuth2 Bearer Token):** Calls `/users/@me` and `/users/@me/guilds` to discover managed servers.
  - **Bot Context (`Bot ${BOT_TOKEN}`):** Calls `/guilds/{id}`, `/users/{id}`, `/guilds/{id}/roles`, `/guilds/{id}/channels`, and modifies member roles directly via `PUT /members/{id}/roles/{id}` during web verification.

---

## 4. Entry Points & Boot Sequences

### 4.1 `@lumi/dashboard` Boot Sequence

```
+-------------------------------------------------------------+
| Docker Container Starts (tini -- bun build/index.js)        |
+-------------------------------------------------------------+
                               |
                               v
+-------------------------------------------------------------+
| Node Adapter Entry (build/index.js)                         |
| - Initializes HTTP listener on PORT=4173                    |
| - Binds SvelteKit SSR runtime                               |
+-------------------------------------------------------------+
                               |
                               v
+-------------------------------------------------------------+
| SvelteKit Server Hook (src/hooks.server.ts)                 |
| - Invoked per incoming HTTP request                         |
| - Reads SessionCookie ('lumi_dashboard_session')            |
| - Validates HMAC signature & loads session from Redis       |
| - Sets security headers: NOSNIFF, DENY frame, CSP, HSTS     |
+-------------------------------------------------------------+
                               |
                               v
+-------------------------------------------------------------+
| Lazy Server Subsystem Initialization                        |
| - env.ts: Validates SESSION_SECRET, BOT_TOKEN, DATABASE_URL |
| - redis.ts: Lazily connects ioredis instance                |
| - prisma.ts: Lazily creates pg.Pool and PrismaClient        |
| - dashboardCache.ts: Configures L1 memory + L2 Redis cache  |
+-------------------------------------------------------------+
                               |
                               v
+-------------------------------------------------------------+
| Route Execution (+layout.server.ts & +page.server.ts)       |
| - Injects authenticated user & CSRF token to client layout  |
| - Executes role-based checks (requireGuildAccess, etc.)     |
+-------------------------------------------------------------+
```

#### Key File Roles:
- `apps/dashboard/Dockerfile`: Multi-stage build (`builder` -> `prod-deps` -> `runtime`). Pre-generates Prisma client with dummy `DATABASE_URL`, builds SvelteKit via `bun run build` targeting `adapter-node`, runs healthcheck against `http://localhost:4173/healthz`.
- `apps/dashboard/src/hooks.server.ts`: Request interceptor. Resolves session cookie, signs/validates HMAC, extracts CSRF token, enforces strict HTTP security headers (X-Content-Type-Options, X-Frame-Options, CSP, Referrer-Policy, Permissions-Policy, HSTS).
- `apps/dashboard/src/lib/server/env.ts`: Central configuration loader. Validates length of `SESSION_SECRET` (>=16 chars), parses `OWNER_IDS`, loads Redis/Postgres/Discord secrets.

### 4.2 `lumi-v2` Bot Core Boot Sequence (`src/index.ts`)
1. Connects to Redis via `@lumi/redis` (`createRedisClient`).
2. Connects to PostgreSQL via `@lumi/db` (`connectDatabase`).
3. Initializes Discord Client (`createClient`).
4. Bootstraps core services: `TieredCache`, `ConfigService`, `PermitRepository`, `Scheduler`, `HealthMonitor`.
5. Registers process exception traps (`unhandledRejection`, `uncaughtException`) hooked into Redis `ErrorStore`.
6. Configures `ModuleLoader` mounting `modules/` (bundled) and `data/addons/` (downloaded add-ons).
7. Instantiates `CommandRegistry`, `CommandSync`, `ModuleManager`, and `AddonManager`.
8. Binds and starts the HTTP RPC Server on `RPC_HTTP_HOST:RPC_HTTP_PORT` (default `127.0.0.1:8091`).
9. Starts Prometheus Metrics Server on `METRICS_PORT` (default `9090`).
10. Registers static commands (ping, about, help, module management, owner commands).
11. Discovers and loads dynamic modules.
12. Registers Discord gateway event listeners (`interactionCreate`, `messageCreate`, `guildMemberAdd`, etc.).
13. Connects to Discord Gateway via `boot({ token, client })`.
14. Registers graceful shutdown handlers for all subsystems.

---

## 5. Shared Code & Cross-Boundary Couplings

### 5.1 Workspace Packages Reused by Dashboard
- `@lumi/cache`: L1 (in-memory LRU) + L2 (Redis) caching logic used for caching user guild lists and module catalogs (`apps/dashboard/src/lib/server/dashboardCache.ts`).
- `@lumi/redis`: Redis connection factory and `InvalidationBus`.
- `@lumi/foundation`: Structured logging (`logger`).
- `@lumi/module-kit`: Type definitions for `ConfigField` schema specification.
- `@prisma/client`: Auto-generated database types and client.

### 5.2 Critical Architectural Leak: Module Shared Code
There is a severe monorepo abstraction leakage in `apps/dashboard/src/lib/server/moduleConfig.ts` line 5:

```ts
// apps/dashboard/src/lib/server/moduleConfig.ts:2-5
import { z } from "zod";
import {
  compileSafeRegex,
  RegexMaxLength,
} from "../../../../../modules/shared/regex.js";
```

**Consequences of this leak:**
1. `apps/dashboard` reaches directly outside its workspace root into `modules/shared/regex.js`.
2. In `apps/dashboard/Dockerfile`, lines 7 and 18 must explicitly copy `modules/shared/` into the build context:
   ```dockerfile
   COPY modules/shared/ ./modules/shared/
   ```
3. This tightly couples the dashboard build to the internal directory structure of bot modules. If `modules/shared/` is refactored or moved, the dashboard build breaks immediately.

### 5.3 Vite & TypeScript Path Aliasing
In `apps/dashboard/vite.config.ts`, packages are mapped to their raw TypeScript sources rather than compiled outputs:
```ts
resolve: {
  alias: {
    "@lumi/foundation": path.resolve(import.meta.dirname, "../../packages/foundation/src/index.ts"),
    "@lumi/module-kit": path.resolve(import.meta.dirname, "../../packages/module-kit/src/index.ts"),
    "@lumi/cache": path.resolve(import.meta.dirname, "../../packages/cache/src/index.ts"),
    "@lumi/redis": path.resolve(import.meta.dirname, "../../packages/redis/src/index.ts"),
  },
}
```
While this avoids pre-compilation during development, it creates direct source dependencies across package boundaries.

---

## 6. Dead Code, Abandoned Features & Historical Apps

### 6.1 Empty Vestigial Directory: `src/routes/api/permits/nodes/`
- **Location:** `/home/rebiz/opt/workdir/lumi-v2/apps/dashboard/src/routes/api/permits/nodes/`
- **Status:** **Completely empty directory** tracked in git.
- **Analysis:** In SvelteKit, a route directory with no `+server.ts` or `+page.svelte` is a dead artifact. It was likely created to implement a dashboard endpoint for permit node lookups before the logic was moved into the server load function (`apps/dashboard/src/routes/guilds/[guildId]/permits/+page.server.ts`), which calls the bot's RPC `/api/v1/permits/nodes` directly. This directory should be pruned.

### 6.2 Dead Historical Sub-App: `apps/worker`
- **Location:** Formerly `apps/worker/` (evidenced in `.git/rr-cache/c320afa6d7b0ca8eff0c04db9f072fa043d2688e/preimage`).
- **Analysis:** Designed to handle asynchronous offloaded work, but abandoned in favor of single-process execution in `lumi-v2` bot core. No leftover build scripts or references remain in `package.json`.

### 6.3 Disconnected / Orphaned Feature Invalidation
- In `apps/dashboard/src/routes/guilds/[guildId]/features/+page.server.ts`, database mutations for `roleMenuGroup`, `roleMenuOption`, `ticketCategory`, and `ticketPanel` are performed with no RPC invalidation or Redis publish events. If the bot caches these rows, the cache will remain stale until bot restart or cache expiry.

---

## 7. Anti-Patterns & Architectural Flaws

### 7.1 Direct Domain Hardcoding for Single Module (`tempvc`)
In a modular architecture, the generic module configuration route (`/guilds/[guildId]/modules/[module]`) should treat all modules uniformly based on their `manifest.json` `configFields`. Instead, `apps/dashboard/src/routes/guilds/[guildId]/modules/[module]/+page.server.ts` contains explicit hardcoding for `tempvc`:

```ts
// apps/dashboard/src/routes/guilds/[guildId]/modules/[module]/+page.server.ts:34
const TempVcModuleName = "tempvc";

function editableFields(module: CatalogModule) {
  return module.name === TempVcModuleName
    ? module.configFields.filter((field) => field.key !== "generators")
    : module.configFields;
}
```

It introduces module-specific form actions `addGenerator` and `removeGenerator` on a generic route, and `+page.svelte` contains custom UI rendering blocks exclusively for `tempvc`. This completely violates modularity and extensibility.

### 7.2 Out-of-Band Redis Key Manipulation
Rather than executing actions through an RPC contract or domain service, the dashboard manually crafts Redis keys belonging to internal bot modules:
1. **Panic Mode (`security/+page.server.ts:133-140`):**
   ```ts
   function panicKey(guildId: string): string {
     return `lumi:security:panic:${guildId}`;
   }
   function moduleLockKey(guildId: string): string {
     return `lumi:lock:module:${guildId}:mod`;
   }
   ```
2. **Verification Sweep Keys (`verify/[token]/+page.server.ts:285-288`):**
   ```ts
   await getRedis().del(`lumi:security:verification:pending:${row.guildId}:${row.userId}`);
   await getRedis().srem(`lumi:security:verification:pending-set:${row.guildId}`, row.userId);
   ```
If the bot's `verification` or `security` module changes its key formatting or data representation, the dashboard silently corrupts or fails to clean up runtime state.

### 7.3 Direct Database Settings Mutation with Pessimistic Retry Loops
In `apps/dashboard/src/lib/server/settings.ts`, setting mutations deserialize the entire `Guild.settings` JSON blob, mutate keys in JavaScript, and upsert it back under a `Serializable` isolation transaction, retrying up to 4 times on PostgreSQL error `P2034`:

```ts
// apps/dashboard/src/lib/server/settings.ts:41-69
async function mutateSettings(guildId: string, mutate: (settings: GuildSettings) => void): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      await getPrisma().$transaction(async (tx) => {
        const guild = await tx.guild.findUnique({ where: { id: guildId }, select: { settings: true } });
        const settings = asSettings(guild?.settings);
        mutate(settings);
        const value = settings as Prisma.InputJsonValue;
        await tx.guild.upsert({ where: { id: guildId }, update: { settings: value }, create: { id: guildId, settings: value } });
      }, { isolationLevel: "Serializable" });
      await invalidateGuildConfig(guildId);
      return;
    } catch (error) {
      if (!isRetryable(error) || attempt === 3) throw error;
    }
  }
}
```
This coarse-grained locking and full-document rewrite pattern creates contention bottlenecks under concurrent dashboard and bot writes.

### 7.4 Client Components Importing Server Module Types
Multiple Svelte components (such as `ConfigFieldInput.svelte` line 2 and `EscalationInput.svelte` line 3) import types directly from `#lib/server/modules.js`:
```svelte
<script lang="ts">
  import type { ConfigField } from "#lib/server/modules.js";
</script>
```
While TypeScript erases type-only imports during compilation, relying on `#lib/server/` imports in client-facing components risks accidental runtime leakage of server-only modules and subverts SvelteKit's `$lib/server` isolation boundaries.

### 7.5 Dual Roles Assignment Flow
In `apps/dashboard/src/routes/verify/[token]/+page.server.ts`, the dashboard assigns Discord roles directly using `BOT_TOKEN` and Discord REST API rather than having the bot process perform the role change. If the bot has internal caches or event handlers for role transitions, out-of-band Discord API updates can cause race conditions or desynchronization.

---

## 8. Backwards Compatibility Shims & Fallbacks

### 8.1 Fallback Timezone System (`TimezoneSelect.svelte`)
When `Intl.supportedValuesOf('timeZone')` is unavailable in legacy browser or Node environments, `TimezoneSelect.svelte` falls back to a hardcoded array of 22 major global timezones (`UTC`, `Europe/London`, `America/New_York`, etc.).

### 8.2 Insecure Cookie Override (`DASHBOARD_INSECURE_COOKIES`)
In `apps/dashboard/src/lib/server/env.ts`:
```ts
cookieSecure: process.env.NODE_ENV === "production" && process.env.DASHBOARD_INSECURE_COOKIES !== "1"
```
Provides a legacy compatibility switch allowing plain HTTP cookies in production environments, primarily for local containerized smoke testing without SSL termination.

### 8.3 Channel Type Compatibility Shim (`backups.ts`)
`apps/dashboard/src/lib/server/backups.ts` maps legacy Discord numeric channel types to backup statistics:
```ts
const ChannelType = {
  Text: 0,
  Voice: 2,
  Category: 4,
  Announcement: 5,
  Stage: 13,
  Forum: 15,
  Media: 16,
} as const;
```
This manual enum ensures that channel backups created on older versions of Discord.js can still be inspected without crashing.

### 8.4 Bitwise Permission Math Shims (`discord.ts`)
`canManageGuild` calculates permissions using raw BigInt bit shifts:
```ts
export const ManageGuildPermission = 1n << 5n;
export const AdministratorPermission = 1n << 3n;
```
This avoids importing large Discord.js dependencies into the dashboard app.

---

## 9. Detailed Route & Component Audit

| Route / File | Method / Type | Purpose | External Dependencies | Key Anti-Patterns / Risks |
| :--- | :--- | :--- | :--- | :--- |
| `src/hooks.server.ts` | Hook | Session parsing & security headers | Redis, `session.ts` | Deletes session cookie on invalid session; strict CSP |
| `src/routes/+layout.server.ts` | Load | Injects user profile & CSRF | `discord.ts` | Exposes minimal user data; tokens remain server-only |
| `src/routes/auth/login/+server.ts` | GET | Initiates OAuth2 PKCE flow | Redis, Discord OAuth | Stores PKCE verifier with 10-minute TTL |
| `src/routes/auth/callback/+server.ts` | GET | Consumes OAuth2 code, creates session | Redis, Discord OAuth | One-time state consumption prevents replay attacks |
| `src/routes/auth/logout/+server.ts` | POST | Destroys Redis session | Redis, CSRF | Only accepts POST with matching CSRF token |
| `src/routes/healthz/+server.ts` | GET | Health probe (Postgres + Redis ping) | Prisma, Redis | Simple `SELECT 1` and `PING` queries |
| `src/routes/guilds/+page.server.ts` | Load | Lists manageable servers | Discord REST, Redis | 45-second user guild cache in Redis |
| `src/routes/guilds/[guildId]/+page.server.ts` | Load | Summary metrics dashboard | Prisma, Discord REST, RPC | Queries Prisma count for permits, tickets, audit logs |
| `src/routes/guilds/[guildId]/modules/+page.server.ts` | Load, Actions | Module catalog & enable toggles | Prisma, RPC | Updates `GuildModule` and notifies bot via RPC |
| `src/routes/guilds/[guildId]/modules/[module]/+page.server.ts` | Load, Actions | Module settings & tempvc generators | Prisma, RPC, Discord REST | **Hardcoded `tempvc` domain logic & actions** |
| `src/routes/guilds/[guildId]/security/+page.server.ts` | Load, Actions | Panic, backups, web verification | Prisma, Redis, RPC | **Direct Redis panic key writing (`lumi:security:panic`)** |
| `src/routes/guilds/[guildId]/permits/+page.server.ts` | Load, Actions | Permit list & creation | Prisma, RPC | Enforces owner-only permissions for wildcard `*` |
| `src/routes/guilds/[guildId]/permits/[permitId]/+page.server.ts` | Load, Actions | Permit editing & target assignments | Prisma, RPC | Built-in permits protected from editing |
| `src/routes/guilds/[guildId]/features/+page.server.ts` | Load, Actions | Role menus & Ticket categories | Prisma, RPC | **No cache invalidation signal sent to bot** |
| `src/routes/guilds/[guildId]/stats/+page.server.ts` | Load | 7-day activity & economy stats | Prisma | Reads stats snapshots and aggregations |
| `src/routes/guilds/[guildId]/addons/+page.server.ts` | Load, Actions | Git repo add/update/install/pin | RPC | Strictly gated by `requireBotOwner` |
| `src/routes/guilds/[guildId]/cases/+page.server.ts` | Load | Guild audit logs / cases | Prisma | Paginated 50 entries per page |
| `src/routes/guilds/[guildId]/settings/+page.server.ts` | Load, Actions | Prefix, permits, log channels | Prisma, Discord REST | Verifies channel targets against live Discord state |
| `src/routes/verify/[token]/+page.server.ts` | Load, Actions | Public captcha verification | Prisma, Redis, Discord REST | **Direct Discord role assignment via bot token & direct Redis del** |
| `src/routes/api/permits/nodes/` | N/A | **Dead directory** | None | Empty folder leftover from aborted feature |
| `src/lib/components/ConfigFieldInput.svelte` | Component | Dynamic form control renderer | Svelte 5 runes | Imports type from `#lib/server/modules.js` |
| `src/lib/components/EscalationInput.svelte` | Component | Warning count escalation editor | Svelte 5 runes | Imports type from `#lib/server/modules.js` |
| `src/lib/components/NodePicker.svelte` | Component | Multi-select permission tree picker | Svelte 5 runes | Clean search and namespace grouping |
| `src/lib/components/ConfirmForm.svelte` | Component | Danger action double-confirmation | Svelte 5 runes | Inlines CSRF hidden field |
| `src/lib/components/TimezoneSelect.svelte` | Component | Timezone search dropdown | Svelte 5 runes | Fallback list for legacy environments |

---

## 10. Rewrite & Modernization Blueprint

For a clean, production-grade rewrite of `apps/dashboard` and its relationship to the bot, the following architectural transformations should be executed:

### 10.1 Decouple Direct Database Access (API-First Architecture)
- **Problem:** The dashboard currently connects directly to the bot's PostgreSQL database and Redis instance, bypassing runtime validation and creating cache invalidation holes.
- **Solution:** Move all domain mutations (permits, settings, tickets, role menus, panic mode) behind a typed RPC or GraphQL/tRPC internal API hosted by the bot. The dashboard becomes a pure presentation client without direct database write privileges.

### 10.2 Eliminate Direct Module Code Import
- **Problem:** `apps/dashboard/src/lib/server/moduleConfig.ts` imports from `modules/shared/regex.js`.
- **Solution:** Move regex validation utilities (`compileSafeRegex`, `RegexMaxLength`) into `@lumi/foundation` or a new `@lumi/validation` package, making it cleanly consumable by both bot modules and the dashboard without breaking monorepo workspace boundaries.

### 10.3 Generalize Module Configuration UI
- **Problem:** `tempvc` generators are hardcoded into `modules/[module]/+page.server.ts` and `+page.svelte`.
- **Solution:** Introduce a standard schema field type in `@lumi/module-kit` (e.g. `type: 'list-object'` or `type: 'generator-map'`) with declarative sub-schemas. The generic module page can then render dynamic list editors without knowing the domain semantics of `tempvc`.

### 10.4 Centralize Redis Key Management
- **Problem:** Dashboard and bot modules duplicate Redis key formatting strings (`lumi:security:panic:...`, `lumi:security:verification:...`).
- **Solution:** Export typed Redis key factory functions from `@lumi/redis` or the respective domain packages. Never allow raw template string key generation across application boundaries.

### 10.5 Reconcile Verification Role Assignment
- **Problem:** Web verification assigns roles via direct Discord REST calls from the dashboard process, bypassing the bot gateway.
- **Solution:** Have the dashboard verify action issue an internal RPC call (`POST /api/v1/verification/complete`) to the bot, which handles role assignment, audit logging, and member cache synchronization within its existing Discord Gateway connection.

### 10.6 Remove Vestigial Artifacts
- Delete empty directory `apps/dashboard/src/routes/api/permits/nodes/`.
- Clean up Vite aliases in favor of standard workspace package resolution using compiled declarations.
