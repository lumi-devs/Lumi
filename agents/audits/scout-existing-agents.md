# SCOUT REPORT: Existing Agent Docs, Architecture & Research Synthesis

**Date**: 2026-11-25  
**Status**: COMPLETE RECONNAISSANCE & ARCHITECTURAL SYNTHESIS  
**Target Directories Audited**:
1. `/home/rebiz/opt/workdir/lumi-v2/agents/` (Active `v2/develop` branch agent docs)
2. `/home/rebiz/opt/workdir/.lumi-agents/` (Persistent workspace vault: architecture specs, RFCs, research audits, deep dives)
3. `/home/rebiz/opt/workdir/wt-lumi/agents/` (Git worktree `wt/fixes` branch agent docs)

---

## 1. Complete Inventory of All Existing Agent Docs

Across all three directories, there are **66 total documents** (26 in `lumi-v2/agents/`, 14 in `.lumi-agents/`, and 26 in `wt-lumi/agents/`).

### 1.1 `lumi-v2/agents/` (26 Documents — Branch: `v2/develop`)

| Document | Lines | Primary Purpose & System Role | Key Source Files & Packages Referenced |
| :--- | :--- | :--- | :--- |
| `00-index.md` | 36 | Master navigation index for agents; links every canonical doc. | `agents/*.md` |
| `addon-dev-guide.md` | 137 | Developer guide for third-party addons: security, packaging, manifests, sandbox rules. | `data/addons/`, `@lumi/module-runtime` |
| `architecture.md` | 309 | Monorepo layout, runtime boundaries, boot sequence, RPC endpoints, v1 deprecations. | `src/index.ts`, `apps/dashboard/`, `packages/*` |
| `cache.md` | 277 | Caching contracts, TTL budgets, keyspaces, invalidation bus, single-flight rules. | `packages/foundation/src/cache.ts`, `packages/db/src/cache.ts` |
| `commands.md` | 240 | Slash command dispatch, autocomplete, option parsers, cooldowns, deferral rules. | `packages/commands/`, `src/handlers/interactionCreate.ts` |
| `conventions.md` | 241 | ESM imports, error handling (`AppError`), structured logging (`@lumi/logger`), lint standards. | `packages/logger/`, `packages/foundation/src/errors.ts` |
| `cron.md` | 55 | Zero-dependency 5-field cron parser, Vixie semantics, timezone evaluator. *(Unique to lumi-v2)* | `packages/cron/src/*` (`parseCron`, `matchesCron`) |
| `dashboard.md` | 272 | SvelteKit SSR dashboard, OAuth sessions, Discord REST client, RPC client calls to bot. | `apps/dashboard/src/*`, `apps/dashboard/src/lib/server/rpc.ts` |
| `db.md` | 243 | Prisma ORM conventions, PostgreSQL schemas, repositories, migrations, seeding. | `prisma/schema.prisma`, `packages/db/src/repositories/*` |
| `downloader.md` | 241 | Addon git clone/pull manager, directory layout, checksum validation, manifest verification. | `packages/downloader/src/*` |
| `migration-guide.md` | 227 | V1 $\rightarrow$ V2 migration runbook: schema transforms, config migrations, breaking changes. | `scripts/migrate-v1.ts`, `prisma/migrations/` |
| `module-data.md` | 196 | Per-guild generic module state persistence via `helpers.moduleData`, JSON schema validation. | `packages/module-runtime/src/helpers/moduleData.ts` |
| `module-dev-guide.md` | 258 | Guide for authoring first-party modules: commands, listeners, tasks, configuration schemas. | `modules/*/core/`, `packages/module-runtime/` |
| `modules.md` | 251 | Module runtime engine, lifecycle hooks (`init`/`start`/`stop`), topological DAG loader. | `packages/module-runtime/src/loader.ts`, `manifest.ts` |
| `operations.md` | 266 | Environment variables, Docker run, Prometheus `/metrics` (port 9090), health `/healthz` (port 8091). | `Dockerfile`, `docker-compose.yml`, `flake.nix` |
| `permissions.md` | 286 | Permit permission system, node hierarchy, wildcard resolution (`*`), role/user evaluation matrix. | `packages/permits/src/*`, `PermitRepository` |
| `redis.md` | 242 | Redis client configuration, key namespaces, distributed Redlock, rate limit token buckets. | `packages/db/src/redis.ts`, `packages/db/src/lock.ts` |
| `reminders.md` | 239 | Natural language reminder parser, recurrence scheduling, delivery worker, database storage. | `modules/utility/reminders/` |
| `role-automation.md`| 238 | Automated role assignment: autorole on join, voice channel roles, sticky roles, bulk jobs. | `modules/roles/core/` |
| `role-menus.md` | 236 | Interactive role assignment menus: reactions, buttons, select menus, temporary role expirations. | `modules/role-menus/core/` |
| `services.md` | 239 | Composition root, dependency injection container, service lifetimes (`singleton`, `scoped`). | `src/container.ts`, `src/services/*` |
| `stats.md` | 241 | Message/voice analytics tracking, Redis rolling counters, aggregation jobs, stats visualizer cards. | `modules/logging/stats/` |
| `testing.md` | 255 | Vitest test framework setup, mock Discord.js fixtures, unit/integration guidelines. | `vitest.config.ts`, `test/fixtures/*` |
| `tickets.md` | 252 | Support ticket system: panel creation, private threads/channels, claim/close workflows, transcripts. | `modules/community/tickets/` |
| `ui.md` | 268 | Standardized `@lumi/ui` card system: embed layout, field limits, button rows, modal builders. | `packages/ui/src/*` |
| `verification-web.md`| 245 | Web-based member verification: token exchange, captcha verification, role assignment. | `apps/dashboard/src/routes/verify/` |

---

### 1.2 `.lumi-agents/` (14 Documents — Shared Knowledge & Research Vault)

Located at root outside version control (`/home/rebiz/opt/workdir/.lumi-agents`).

| Document | Location | Purpose & Core Content |
| :--- | :--- | :--- |
| `INDEX.md` | Root | Master agent workspace registry, directory definitions, agent rules, system architecture summary. |
| `ARCHITECTURE-SPEC-v2.md` | Root | Authoritative blueprint (LUMI-ARCH-002, v2.1.0): 2-tier cache, RPC service boundary, module engine, Docker layout. |
| `ARCHITECTURE-SPEC.md` | Root | Initial draft specification (LUMI-ARCH-001, v2.0.0); superseded by v2. |
| `0001-caching-architecture-rfc.md` | `forum/` | RFC: Multi-tier caching architecture (Memory LRU + Redis L2 + Invalidation pub/sub + Single-flight). |
| `001-comparative-bot-architecture.md` | `forum/` | Comparative analysis evaluating YAGPDB, Skyra, and Red-DiscordBot against Lumi v2 design targets. |
| `001-caching-patterns.md` | `research/` | Research summary on high-scale Discord bot caching, latency profiles, single-flight patterns. |
| `002-yagpdb-deep-dive.md` | `research/` | Deep architectural audit of YAGPDB: `dshardorchestrator`, `ccache` L1, Redis L2, distributed workers. |
| `003-skyra-deep-dive.md` | `research/` | Deep architectural audit of Skyra: Sapphire Framework, worker threads, `AsyncQueue` per-guild locks. |
| `004-redbot-deep-dive.md` | `research/` | Deep architectural audit of Red-DiscordBot: Cog lifecycle, driver abstraction, JSON/Postgres scopes. |
| `cache-audit.md` | `research/` | Critical audit of Lumi v2 cache: identifies 5-second TTL cap, lack of pub/sub sync in ConfigService, PermitRepo misses. |
| `dashboard-data-flow-audit.md` | `research/` | End-to-end audit of SvelteKit dashboard: SSR route loading, RPC routes, DB bypasses, permit sync gap. |
| `LumiDevExAudit.md` | `research/` | Developer experience audit: Docker Compose gaps, missing bootstrap scripts, Bun/Nix reproducibility issues. |
| `redbot-architecture-audit.md` | `research/` | Analysis of Red-DiscordBot configuration isolation, driver patterns, and cog unload guarantees. |
| `skyra-deep-audit.md` | `research/` | Analysis of Skyra worker thread pool, regex filtering with `confusables`, and derived settings caching. |
| `yagpdb_audit.md` | `research/` | Audit of YAGPDB process boundaries, Redis pub/sub messaging protocols, and distributed shard orchestration. |

---

### 1.3 `wt-lumi/agents/` (26 Documents — Git Worktree: `wt/fixes`)

Located at `/home/rebiz/opt/workdir/wt-lumi/agents/` (branch `wt/fixes` at commit `03b17b7`).
- Shares 24 documents identical or near-identical to `lumi-v2/agents/`.
- **Divergence #1 (`custom-commands.md`)**: Contains `custom-commands.md` (217 lines), documenting the complete authoring, trigger parsing, Mustache AST template language, KV store, and scheduling system for `modules/custom-commands/`.
- **Divergence #2 (Missing `cron.md`)**: Does not have `cron.md` because `packages/cron` was introduced on `v2/develop`.
- **Divergence #3 (`architecture.md`)**: Older revision (10,523 bytes vs 12,131 bytes) lacking the updated RPC specification section and `@lumi/cron` package mapping, but retaining `custom-commands`.
- **Divergence #4 (`00-index.md`)**: Indexes `custom-commands.md` instead of `cron.md`.

---

## 2. Architecture Decisions Already Made

Based on `ARCHITECTURE-SPEC-v2.md`, `lumi-v2/agents/architecture.md`, `services.md`, and research consensus:

### 2.1 Language, Runtime & Monorepo Structure
- **Runtime**: **Bun 1.4+** as primary runtime and package manager; Node v24+ LTS compatibility maintained. TypeScript 5.9 in strict mode.
- **Monorepo Structure**:
  - `apps/dashboard`: SvelteKit SSR web management UI.
  - `packages/foundation`: Common types, error classes (`AppError`), utility helpers, in-memory LRU cache.
  - `packages/db`: Prisma ORM client, `CacheService` (Redis wrapper), `RedisLock`, database repositories.
  - `packages/logger`: Structured Pino-based logging with correlation IDs.
  - `packages/permits`: Permit evaluation engine, bitmask operations, permit node hierarchy.
  - `packages/commands`: Command dispatch, option parsers, cooldown management.
  - `packages/module-runtime`: Module loader, dependency DAG, manifest schemas, lifecycle manager.
  - `packages/ui`: Component library for Discord cards, embeds, buttons, and select menus.
  - `packages/cron`: Zero-dependency 5-field cron parser, Vixie semantics, timezone evaluator.
  - `packages/downloader`: Third-party addon git clone, update, and integrity validation engine.
  - `modules/*`: First-party functional modules (utility, moderation, roles, logging, community, role-menus).

### 2.2 Process & Service Boundaries
- **Bot Engine (`src/index.ts`)**: Authoritative Discord Gateway daemon handling live gateway events, member/guild caches, module execution, and background schedulers.
- **Web Dashboard (`apps/dashboard`)**: Separate SvelteKit SSR process. Does not connect to Discord Gateway; does not access Discord bot internal memory maps directly.
- **Control Plane (Internal HTTP RPC)**:
  - The bot runs an HTTP RPC server on `127.0.0.1:8091` guarded by `RPC_INTERNAL_TOKEN`.
  - Dashboard communicates with bot exclusively via `/api/v1/*` HTTP RPC endpoints.
  - Decoupled deployments: dashboard can be restarted without dropping Discord gateway connections.
- **Database Boundaries**:
  - Database is the source of truth for persistent configuration (module settings, permits, reminders, tickets, custom command definitions).
  - Dashboard writes persistent config directly to PostgreSQL, then invalidates caches.
  - Dashboard queries bot RPC for live state (loaded modules, active nodes, guild presence, member counts).

### 2.3 Storage & Caching Architecture
- **PostgreSQL 18** (Prisma ORM): Durable transactional data store.
- **Redis 8** (`ioredis`): Distributed shared state, L2 cache, pub/sub invalidation bus, distributed Redlock, sliding-window rate limiters.
- **Two-Tier Cache Contract**:
  - **L1 In-Memory LRU**: Hot path zero-overhead lookups (<0.01ms).
  - **L2 Redis**: Multi-replica shared cache (<1ms).
  - **Invalidation Bus**: Pub/sub events evict local L1 caches across all instances.

### 2.4 Permission & Access Control System (`@lumi/permits`)
- **Decoupled from Discord Roles**: Discord roles and users are mapped to **Permit Nodes** (`guild.admin`, `mod.ban`, `tickets.manage`, `utility.remind`).
- **Dynamic Node Catalog**: The bot dynamically aggregates permit nodes from built-in permits, loaded module command definitions (`requiredPermit`), and custom database permits.
- **Wildcard Matching**: Supports hierarchical wildcards (`mod.*` grants `mod.ban`, `mod.mute`, etc.).
- **Pre-computed Evaluation Matrix**: Evaluates explicit denies first, then explicit allows, falling back to guild defaults or Discord `Administrator` bypass.

### 2.5 Module Runtime & Sandboxing
- **Manifest-Driven**: Every module declares an explicit `manifest.ts` with ID, version, dependencies, permissions, and configuration schema.
- **Lifecycle States**: Discovered $\rightarrow$ Loaded (registered in memory) $\rightarrow$ Enabled (listeners attached, commands dispatched, schedules active).
- **Dependency DAG**: Strict topological sorting ensures modules boot only after their dependencies are enabled and shut down in reverse order.
- **Privacy / GDPR Mandate**: Modules storing user data must implement `exportUserData` and `deleteUserData` hooks.

### 2.6 Deliberately Removed / Rejected from v1
1. **Locale & i18n Stack**: Removed completely. Single-language (English) simplified codebase; eliminated runtime localization lookups on every message/embed.
2. **Redis Cluster / Sentinel Complexity**: Stripped out in favor of standalone Redis with standard master-replica or managed cloud failover.
3. **Global Service Locator (`container`)**: Removed global static service locators; replaced with an explicit composition root (`src/container.ts`) passed through module context.
4. **Essential / Disableable Module Hierarchy**: Eliminated arbitrary \"essential\" tiering; all modules now follow the unified dependency graph.
5. **Dynamic Slash Command Registration**: Replaced global runtime registration with atomic per-guild slash command registration on ready/sync.

---

## 3. Ongoing Plans and Their Status

| Plan / Initiative | Source Document | Stated Goal | Current Reality & Status |
| :--- | :--- | :--- | :--- |
| **TieredCache Implementation** | `ARCHITECTURE-SPEC-v2.md`, RFC `0001` | Unified L1 LRU + L2 Redis cache with single-flight deduplication and pub/sub coherence. | **Incomplete / Divergent**: `packages/foundation/src/cache.ts` has basic in-memory LRU with hardcoded 5s TTL. `CacheService` in `packages/db` wraps Redis without L1 coherence or single-flight protection. |
| **Turnkey Dockerization** | `ARCHITECTURE-SPEC-v2.md`, RFC `0002` | Production `docker-compose.yml`, multi-stage Dockerfiles for bot and dashboard, `scripts/setup.sh`. | **Planned / Documented in Spec**: Root `Dockerfile` and compose recipes outlined in docs; developer setup script referenced in forum index but missing from repository. |
| **Documentation Realignment** | RFC `0003`, `LumiDevExAudit.md` | Reconcile outdated documentation with true implementation; audit RPC parameters and cache behavior. | **In Progress**: Multiple research audits completed in `.lumi-agents/research/`; synthesis report underway. |
| **Custom Commands Module** | `wt-lumi/agents/custom-commands.md` | No-code guild command authoring with Mustache AST templates, schedules, and KV engine. | **Branch Divergence**: Fully specified and implemented on worktree branch `wt/fixes`, but omitted from `v2/develop` branch and not yet merged. |
| **Multi-Process Fleet Scaling** | `architecture.md`, `001-comparative-bot-architecture.md` | Shard orchestrator process managing multi-process worker nodes communicating over Redis. | **Future Roadmap**: Documented in architecture roadmap; current deployment remains single-process bot daemon + SvelteKit dashboard. |
| **Addon Downloader & Sandboxing** | `downloader.md`, `addon-dev-guide.md` | Git-based third-party addon downloading, hash verification, pinned versions, AST security scan. | **Partially Implemented**: Git clone/pull and manifest validation in `packages/downloader`; AST sandbox isolation remains in design. |

---

## 4. Contradictions Between Documents and Code Reality

Cross-referencing the specifications (`ARCHITECTURE-SPEC-v2.md`, `architecture.md`), research audits (`cache-audit.md`, `dashboard-data-flow-audit.md`), and actual code reveals several critical contradictions:

### 4.1 Contradiction 1: Permit Caching & Cache Invalidation
- **Documented in `architecture.md` (lines 190-192) & `ARCHITECTURE-SPEC-v2.md`**:
  > *\"Step 6: Bot's PermitRepository invalidates cache via Redis pub/sub; next check sees new permit.\"*
  > *\"Cache Key: `lumi:guild:{guildId}:permits`: Pre-calculated permit evaluation matrix for roles & channels.\"*
- **Actual Code Reality (`packages/db/src/repositories/PermitRepository.ts`)**:
  - `PermitRepository` contains **zero caching logic**.
  - It has no reference to `CacheService`, in-memory cache, or Redis pub/sub.
  - Every call to `hasPermit()`, `listPermits()`, or `getUserPermits()` executes **direct SQL queries via Prisma** against the database.
  - When the dashboard writes a new permit via Prisma, it does not send an RPC invalidation or Redis pub/sub message, and the bot continues querying Postgres on demand anyway.

### 4.2 Contradiction 2: L1 In-Memory Cache TTL & Strategy
- **Documented in `ARCHITECTURE-SPEC-v2.md` & `cache.md`**:
  - Specifies an adaptive TTL between **30 seconds and 300 seconds** (1 to 5 minutes) with bounded LRU eviction (up to 10,000 entries).
- **Actual Code Reality (`packages/foundation/src/cache.ts`)**:
  - L1 cache TTL is **hard-capped at 5 seconds** (`maxTtlMs = 5000`).
  - While 5 seconds minimizes desynchronization across processes without pub/sub, it completely fails to protect the database during sustained high-throughput events (e.g. 100 msg/sec over 10 minutes).

### 4.3 Contradiction 3: ConfigService Invalidation Bus Subscriptions
- **Documented in `ARCHITECTURE-SPEC-v2.md` & `cache.md`**:
  - Changes to guild module configuration publish an invalidation event over Redis (`lumi:cache:invalidate`), triggering all running nodes to invalidate local L1 and L2.
- **Actual Code Reality (`packages/db/src/services/ConfigService.ts`)**:
  - `ConfigService` does not subscribe to Redis pub/sub invalidation channels on the config namespace.
  - Invalidation only occurs if a mutation is explicitly made via the HTTP RPC endpoint (`POST /api/v1/guilds/:id/modules/:module/state`), bypassing Redis pub/sub listeners.

### 4.4 Contradiction 4: Redis Invalidation Channel Naming Divergence
- **`ARCHITECTURE-SPEC-v2.md` & `001-caching-patterns.md`**: Specify Redis pub/sub channel `lumi:cache:invalidate` with JSON payload `{ key, guildId }`.
- **`packages/db/src/cache.ts` & `redis.md`**: Refer to channel `lumi:invalidation` publishing raw string keys.
- Any service publishing on `lumi:cache:invalidate` is completely ignored by listeners subscribed to `lumi:invalidation`.

### 4.5 Contradiction 5: Worktree & Module Divergence (`custom-commands` vs `cron`)
- **`v2/develop` branch (`lumi-v2`)**:
  - Includes `packages/cron/` and `agents/cron.md`.
  - Completely missing `modules/custom-commands/` and `agents/custom-commands.md`.
  - `00-index.md` lists `cron.md`.
- **`wt/fixes` worktree (`wt-lumi`)**:
  - Includes `modules/custom-commands/` and `agents/custom-commands.md`.
  - Completely missing `packages/cron/` and `agents/cron.md`.
  - `00-index.md` lists `custom-commands.md`.
- **Impact**: The two active branches have diverged at both the documentation level and the codebase level. Feature code present in `wt/fixes` is invisible to `v2/develop`.

### 4.6 Contradiction 6: Phantom RFCs in `.lumi-agents/INDEX.md`
- `.lumi-agents/INDEX.md` claims the following RFCs exist:
  - `forum/0002-docker-and-bootstrap-rfc.md`
  - `forum/0003-docs-revamp-plan.md`
- File system inspection confirms **neither file exists** in `.lumi-agents/forum/` (only `0001-caching-architecture-rfc.md` and `001-comparative-bot-architecture.md` are present).

### 4.7 Contradiction 7: Dashboard Direct Database Writes vs RPC Protocol
- **Documented Principle**: The dashboard communicates exclusively through RPC and \"never reads live bot state from the database\".
- **Code Reality**: While read traffic for live bot state routes through RPC, the dashboard writes directly to PostgreSQL for OAuth sessions, audit logs, and permits via Prisma. However, the bot daemon is not notified of direct permit table modifications, creating a silent synchronization gap.

---

## 5. Key Design Decisions to Preserve

During any codebase overhaul or rewrite, the following core architectural decisions represent high-value engineering that must be preserved:

### 5.1 Decoupled Authoritative Bot Daemon vs SvelteKit Dashboard
- **Decision**: Keep the bot daemon authoritative over live Discord state, exposing a lean HTTP RPC interface (`127.0.0.1:8091`) to the dashboard.
- **Reason**: Allows the SvelteKit dashboard to restart, reload, or crash without dropping gateway connections, losing in-flight voice connections, or triggering Discord gateway re-identifies.

### 5.2 Dynamic Permit Node Catalog via RPC
- **Decision**: The dashboard queries `/api/v1/permits/nodes?guild_id=...` to construct the node selector, rather than hardcoding nodes or querying static DB tables.
- **Reason**: Modules dynamically contribute permission nodes via command manifests (`requiredPermit`). Only the running bot daemon knows which modules are active and what permissions they require.

### 5.3 Manifest-Driven Module DAG & Lifecycle
- **Decision**: Strict declarative `manifest.ts` per module with explicit dependencies, sorted topologically at boot.
- **Reason**: Guarantees deterministic startup and shutdown order; prevents runtime race conditions where a consumer module invokes an uninitialized dependency.

### 5.4 AST-Based Restricted Template Parser (Zero Eval)
- **Decision**: The template engine used for custom commands and notification formatting (Mustache-style `{{...}}`) parses tokens into an explicit AST and evaluates against a strict whitelist context.
- **Reason**: Absolutely forbids `eval`, `new Function`, `process`, or prototype access (`__proto__`), preventing remote code execution (RCE) via user-authored templates.

### 5.5 Standardized `@lumi/ui` Design System
- **Decision**: All command responses, notifications, and interaction flows return structured cards from `@lumi/ui`.
- **Reason**: Enforces consistent brand aesthetics, accessibility standards, Discord character/field length safety, and error handling across both first-party modules and third-party addons.

### 5.6 Per-Guild Slash Command Registration Strategy
- **Decision**: Register slash commands per guild on ready/sync, rather than relying exclusively on global Discord application command registration.
- **Reason**: Global Discord slash command updates can take up to an hour to propagate across Discord's CDN, making development, testing, and multi-tenant guild customization frustrating. Per-guild registration updates instantaneously.

### 5.7 Explicit Composition Root (No Global Container)
- **Decision**: Explicit constructor injection through `src/container.ts` and `ModuleContext`.
- **Reason**: Eradicates hidden global state, simplifies unit testing via mock injection, and prevents circular dependency cycles.

---

## 6. What's Outdated or Superseded

### 6.1 Artifacts in `.lumi-agents/`
- **`ARCHITECTURE-SPEC.md`**: Superseded by `ARCHITECTURE-SPEC-v2.md`. Contains preliminary schemas that lack the RPC endpoints, multi-tier cache specifics, and addon downloader mechanics established in v2.
- **`INDEX.md` Forum RFC Listings**: References non-existent files `0002-docker-and-bootstrap-rfc.md` and `0003-docs-revamp-plan.md`.
- **`forum/0001-caching-architecture-rfc.md`**: Marked as draft/RFC; its conclusions were integrated into `ARCHITECTURE-SPEC-v2.md`, but its proposed `TieredCache` implementation was never completed in the code.

### 6.2 Superseded Code & Concepts from Lumi v1
- **`packages/core` module**: Extracted and decomposed into `@lumi/module-runtime` and `@lumi/commands`.
- **Essential vs Disableable Module Model**: Obsolete; replaced by dynamic manifest dependency graph.
- **Localization / i18n**: Fully deprecated. Do not preserve any translation keys, locale loaders, or language resolution middleware.
- **Global `container` Singleton**: Obsolete; all new services must use explicit constructor injection.

### 6.3 Branch Divergence to Reconcile (`v2/develop` vs `wt/fixes`)
- `modules/custom-commands` on `wt/fixes` contains valid production-ready logic (AST parser, KV engine, schedules) that must be ported to `v2/develop`.
- `packages/cron` on `v2/develop` provides zero-dependency cron validation that should be utilized by `modules/custom-commands` for schedule evaluation, replacing any external cron dependencies.
- Documentation indices (`00-index.md`) in both branches must be unified to include both `cron.md` and `custom-commands.md`.

---

## 7. Comparative Architectural Insights (from External Bots)

From the deep dives into YAGPDB, Skyra, and Red-DiscordBot in `.lumi-agents/research/` and `forum/001-comparative-bot-architecture.md`:

```
+--------------------------------------------------------------------------------------------------+
| FEATURE                  | YAGPDB (Go)            | SKYRA (TS/Sapphire)     | LUMI v2 (Target)   |
+--------------------------------------------------------------------------------------------------+
| L1 In-Memory Cache       | ccache (1 min)         | Collection / WeakMap    | TieredCache LRU    |
| L2 Distributed Cache     | Redis (radix/v3)       | PostgreSQL (Direct)     | Redis 8 (ioredis)  |
| Cache Coherence Bus      | Redis Pub/Sub          | None (Single Process)   | Redis Pub/Sub      |
| Request Coalescing       | Singleflight           | AsyncQueue (Per-Guild)  | Single-Flight Pkg  |
| CPU-Heavy Isolation      | Separate Worker Procs  | Worker Threads Pool     | Worker Threads     |
| Config Serialization     | Distributed Locks      | AsyncQueue Locks        | Redlock + Mutex    |
| Dashboard Communication  | Shared Redis / DB      | Internal REST API       | HTTP RPC (Port 8091|
+--------------------------------------------------------------------------------------------------+
```

### Lessons to Adopt in Lumi v2:
1. **Adopt Skyra's Per-Guild `AsyncQueue` / Mutex for Settings Writes**: Prevents database race conditions and duplicate entries when concurrent interactions or dashboard updates modify guild state.
2. **Adopt YAGPDB's Single-Flight Request Coalescing**: When L1 and L2 cache miss on a hot guild (e.g. during a raid), ensure only one in-flight query executes against PostgreSQL, coalescing all concurrent requests to that promise.
3. **Worker Thread Pool for CPU Tasks**: Follow Skyra's pattern of using `node:worker_threads` for CPU-intensive operations (e.g. regex filtering, homoglyph confusables removal, image rendering) to keep the primary Discord event loop completely unblocked.

---

## 8. Concrete Action Plan for Reconstruction

1. **Synchronize Worktree Branches**:
   - Port `modules/custom-commands/` from `wt/fixes` into `v2/develop`.
   - Wire `modules/custom-commands/` schedules to `@lumi/cron`.
   - Update `agents/00-index.md` and `agents/architecture.md` to reference both `cron.md` and `custom-commands.md`.
2. **Implement Unified `TieredCache`**:
   - Build `TieredCache<T>` in `@lumi/foundation` combining LRU memory cache, Redis L2, single-flight coalescing, and Redis pub/sub invalidation (`lumi:invalidation`).
   - Wire `TieredCache` into `PermitRepository` to eliminate direct DB queries on hot permit checks.
   - Expand L1 TTL from 5s to 60s with pub/sub coherence.
3. **Align Dashboard RPC State Sync**:
   - When dashboard mutates permits via Prisma, trigger an RPC invalidation call to the bot or publish directly to `lumi:invalidation`.
4. **Clean Workspace Docs**:
   - Archive `ARCHITECTURE-SPEC.md` in `.lumi-agents/archive/`.
   - Update `.lumi-agents/INDEX.md` to reflect actual existing RFC files.