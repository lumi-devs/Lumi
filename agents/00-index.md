# Lumi v2 Agent Intelligence Index & Master Cartography

Master navigation index for AI agents and developers working on Lumi v2. Every canonical specification, domain model, engineering convention, operational workflow, codebase audit, and research deep-dive is indexed here.

---

## 1. System Architecture (`agents/architecture/`)

| Document | Purpose & Scope |
| :--- | :--- |
| [architecture.md](./architecture/architecture.md) | High-level monorepo layout, runtime boundaries, boot sequence, RPC endpoints, and service lifecycles. |
| [services.md](./architecture/services.md) | Composition root (`src/container.ts`), dependency injection, and service lifetimes. |
| [modules.md](./architecture/modules.md) | Module runtime engine, lifecycle hooks (`init`/`start`/`stop`), and topological DAG loader. |
| [module-data.md](./architecture/module-data.md) | Per-guild generic module state persistence via `helpers.moduleData` with JSON schema validation. |
| [cache.md](./architecture/cache.md) | Caching contracts, TTL budgets, keyspaces, invalidation bus, and single-flight rules. |
| [redis.md](./architecture/redis.md) | Redis client configuration, key namespaces, distributed Redlock, and rate-limit token buckets. |
| [db.md](./architecture/db.md) | Prisma ORM conventions, PostgreSQL schemas, repositories, migrations, and seeding. |
| [commands.md](./architecture/commands.md) | Slash command dispatch, autocomplete, option parsers, cooldowns, and deferral rules. |
| [permissions.md](./architecture/permissions.md) | Permit permission system, node hierarchy, wildcard resolution (`*`), and role/user evaluation matrix. |
| [downloader.md](./architecture/downloader.md) | Addon git clone/pull manager, directory layout, checksum validation, and manifest verification. |
| [cron.md](./architecture/cron.md) | Zero-dependency 5-field cron parser, Vixie semantics, and timezone evaluator (`@lumi/cron`). |
| [dashboard.md](./architecture/dashboard.md) | SvelteKit SSR dashboard, OAuth sessions, Discord REST client, and RPC client calls to bot. |

---

## 2. Feature Domains (`agents/domains/`)

| Document | Purpose & Scope |
| :--- | :--- |
| [role-automation.md](./domains/role-automation.md) | Automated role assignment: autorole on join, voice channel roles, sticky roles, and bulk jobs. |
| [role-menus.md](./domains/role-menus.md) | Interactive role assignment menus: reactions, buttons, select menus, and temporary role expirations. |
| [reminders.md](./domains/reminders.md) | Natural language reminder parser, recurrence scheduling, delivery worker, and database storage. |
| [tickets.md](./domains/tickets.md) | Support ticket system: panel creation, private threads/channels, claim/close workflows, and transcripts. |
| [stats.md](./domains/stats.md) | Message/voice analytics tracking, Redis rolling counters, aggregation jobs, and stats visualizer cards. |
| [verification-web.md](./domains/verification-web.md) | Web-based member verification: token exchange, captcha verification, and role assignment. |
| [ui.md](./domains/ui.md) | Standardized `@lumi/ui` card system: embed layout, field limits, button rows, and modal builders. |

---

## 3. Engineering Conventions (`agents/conventions/`)

| Document | Purpose & Scope |
| :--- | :--- |
| [conventions.md](./conventions/conventions.md) | ESM imports, error handling (`AppError`), structured logging (`@lumi/logger`), and lint standards. |
| [testing.md](./conventions/testing.md) | Vitest test framework setup, mock Discord.js fixtures, and unit/integration guidelines. |

---

## 4. Workflows & Runbooks (`agents/workflows/`)

| Document | Purpose & Scope |
| :--- | :--- |
| [addon-dev-guide.md](./workflows/addon-dev-guide.md) | Developer guide for third-party addons: security, packaging, manifests, and sandbox rules. |
| [module-dev-guide.md](./workflows/module-dev-guide.md) | Guide for authoring first-party modules: commands, listeners, tasks, and configuration schemas. |
| [migration-guide.md](./workflows/migration-guide.md) | V1 to V2 migration runbook: schema transforms, config migrations, and breaking changes. |
| [operations.md](./workflows/operations.md) | Environment variables, Docker run, Prometheus `/metrics` (port 9090), and health `/healthz` (port 8091). |

---

## 5. Architectural Audits & Reconnaissance (`agents/audits/`)

| Document | Findings & Target |
| :--- | :--- |
| [scout-root-config.md](./audits/scout-root-config.md) | Monorepo root configuration, Bun workspace settings, dependencies, and environment audit. |
| [scout-apps-structure.md](./audits/scout-apps-structure.md) | Detailed audit of SvelteKit dashboard app, bot core boundaries, RPC calls, and anti-patterns. |
| [scout-src-core.md](./audits/scout-src-core.md) | Audit of `src/` core dispatch, admin panel decoupling, error stores, and composition root. |
| [scout-lumi-addons.md](./audits/scout-lumi-addons.md) | Audit of 11 first-party addons in `lumi-addons`, contracts, permission flaws, and test gaps. |
| [scout-wt-lumi.md](./audits/scout-wt-lumi.md) | Comparative diff between `wt-lumi` (`wt/fixes`) and `lumi-v2` (`v2/develop`), identifying lost subsystems. |
| [scout-existing-agents.md](./audits/scout-existing-agents.md) | Synthesis of 66 agent documents across `.lumi-agents`, `lumi-v2`, and `wt-lumi`, highlighting contradictions. |

---

## 6. External Research & Reference Reconnaissance (`agents/research/`)

| Document | Core Topic & Comparative Analysis |
| :--- | :--- |
| [reference-bots-reconnaissance.md](./research/reference-bots-reconnaissance.md) | Deep comparative architecture of YAGPDB (Go), Discord-Bot (Node), and Red-DiscordBot (Python). |
| [001-caching-patterns.md](./research/001-caching-patterns.md) | High-scale caching patterns, latency budgets, and single-flight request coalescing. |
| [002-yagpdb-deep-dive.md](./research/002-yagpdb-deep-dive.md) | YAGPDB architecture: `dshardorchestrator`, 3-tier event pipeline, and Redis pub/sub. |
| [003-skyra-deep-dive.md](./research/003-skyra-deep-dive.md) | Skyra architecture: Sapphire framework, worker thread pools, and per-guild async locks. |
| [004-redbot-deep-dive.md](./research/004-redbot-deep-dive.md) | Red-DiscordBot architecture: Cog lifecycle, driver abstraction, and JSON-RPC daemon. |
| [cache-audit.md](./research/cache-audit.md) | Critical analysis of Lumi v2 cache implementation gaps and desynchronization vectors. |
| [dashboard-data-flow-audit.md](./research/dashboard-data-flow-audit.md) | SvelteKit dashboard data flow, SSR loading, and RPC synchronization analysis. |
| [LumiDevExAudit.md](./research/LumiDevExAudit.md) | Developer experience audit, Nix/Bun reproducibility, and Docker compose readiness. |

---

*Keep this index current. Any document not linked here does not exist for agents.*
