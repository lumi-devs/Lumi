---
title: "Web Admin Dashboard"
description: "The dashboard's route inventory, internal RPC bridge, auth model, and design tokens."
category: "Core Architecture"
---

# Web Admin Dashboard

Reference for `apps/dashboard` - the Next.js (App Router) web administration panel. For where the dashboard sits in the wider system, see [Architecture § Dashboard Frontend](/architecture#dashboard-frontend); for the environment variables it reads, see [Configuration Reference § Dashboard Settings](/configuration#dashboard-settings).

## Hard Boundaries

Three architectural rules define the app:

1. **The dashboard never opens a PostgreSQL or Redis connection.** There is no Prisma client, no `ioredis` import, and no database connection string. Every read and every write is an HTTP RPC call to `apps/worker`'s internal RPC server (`http://worker:8091/rpc`), which owns the database.
2. **The dashboard never holds the Discord bot token.** It holds OAuth2 *application* credentials (`DISCORD_OAUTH2_CLIENT_ID` / `DISCORD_OAUTH2_CLIENT_SECRET`) so users can authenticate as themselves. Bot actions are executed by the worker on the other end of an RPC call.
3. **Nothing that talks to the internal RPC server is reachable from the browser.** `src/lib/rpc.ts`, `src/lib/env.ts`, `src/lib/auth.ts`, `src/lib/auth-guards.ts`, `src/lib/dashboard-fetch.ts`, and `src/lib/rate-limit.ts` all start with `import "server-only"`, making client-side bundling a build-time error.

### Standalone Bot Operation

`apps/worker` never depends on `apps/dashboard` being online. Self-hosters who prefer managing Lumi exclusively via Discord slash commands and `/lumi panel` can omit running `apps/dashboard` entirely, or disable the dashboard module per-guild via `/modules disable dashboard`.

---

## App Router Structure

```
src/
  app/                  App Router pages and layout groups
  actions/              Server Actions - mutations partitioned by domain
  components/
    ui/                 Primitives: button, card, table, input, switch, badge, alert
    layout/             Chrome: site-header, side-nav, guild-side-nav, system-side-nav
    guild/  system/     Feature views for guild management and bot-owner admin
  lib/                  rpc.ts, auth.ts, auth-guards.ts, dashboard-fetch.ts, env.ts
  proxy.ts              Next 16 edge proxy / request headers & rate limiting
  instrumentation.ts    OTel tracing, Prometheus metrics, and RPC readiness probe
```

### Route Inventory

| Route | Guard | Purpose |
| :--- | :--- | :--- |
| `/` | none | Landing page when signed out, server picker when signed in. |
| `/login` | none | Branded sign-in screen. Initiates Discord OAuth2 via NextAuth. |
| `/api/auth/[...nextauth]` | none | NextAuth route handler (`/signin`, `/callback/discord`, `/session`, `/signout`). |
| `/account` | `requireSession` | Self-service GDPR export of the signed-in user's data. |
| `/guild-picker` | `requireSession` | Server selection list for switching guilds. |
| `/guild/[guildId]` | `requireGuild` | General settings: prefix, mute role, locale, timezone. |
| `/guild/[guildId]/modules` | `requireGuild` | Per-guild module toggle grid. |
| `/guild/[guildId]/modules/[moduleName]` | `requireGuild` | Schema-driven dynamic configuration form for a specific module. |
| `/guild/[guildId]/permits` | `requireGuild` | Permit management: create/edit custom permits, role/user assignments. |
| `/guild/[guildId]/moderation` | `requireGuild` | Moderation case log, search, filter, and case revocation. |
| `/guild/[guildId]/warn-thresholds` | `requireGuild` | Escalating automated warning threshold rules. |
| `/guild/[guildId]/security` | `requireGuild` | Panic mode toggle, join gate, and verification panel settings. |
| `/guild/[guildId]/tempvc` | `requireGuild` | Temporary voice channel generators and active channel records. |
| `/guild/[guildId]/overrides` | `requireGuild` | Channel, role, user, and category configuration overrides. |
| `/guild/[guildId]/history` | `requireGuild` | Configuration change audit ledger with one-click rollback. |
| `/guild/[guildId]/audit` | `requireGuild` | Guild administrative action audit log. |
| `/guild/[guildId]/blocklist` | `requireGuild` | Per-guild user blocklist management. |
| `/guild/[guildId]/advanced` | `requireGuild` | Ignored channels, active AFK records, and raw module data. |
| `/system` | `requireBotOwner` | Global bot configuration and maintenance mode. |
| `/system/modules` | `requireBotOwner` | Global module kill-switches. |
| `/system/addons` | `requireBotOwner` | Addon repository management: add, install, uninstall, rollback. |
| `/system/blocklist` | `requireBotOwner` | Global user blocklist. |
| `/system/audit` | `requireBotOwner` | Cross-guild system audit logs. |
| `/system/shards` | `requireBotOwner` | Real-time gateway shard telemetry fleet monitor. |

---

## The RPC Bridge

`src/lib/rpc.ts` encapsulates outbound HTTP RPC communication with `apps/worker` (`packages/core/src/lib/rpc/http-server.ts`):

- **Endpoint**: `POST ${RPC_HTTP_URL}/rpc` (default `http://127.0.0.1:8091/rpc`).
- **Authentication**: Sent with header `Authorization: Bearer <RPC_INTERNAL_TOKEN>`.
- **Trace Context**: Automatically injects W3C `traceparent` and `tracestate` headers to preserve OpenTelemetry distributed traces.
- **Timeout**: 8000ms default timeout enforced via `AbortController`.
- **Types**: Wire types (`RpcRequest`, `RpcResponse`) and payload definitions (`RpcRequestPayloads`, `RPC_ACTIONS`) are imported from `@lumi/contracts`.

---

## RPC Action Surface (66 Actions)

The 66 actions defined in `packages/contracts/src/rpc.ts`:

| Group | Actions |
| :--- | :--- |
| **Auth** (1) | `auth.whoami` |
| **Global & GDPR** (2) | `global.gdpr.delete`, `global.gdpr.export` |
| **Addon Downloader** (6) | `downloader.repo.add`, `downloader.repo.list`, `downloader.repo.modules`, `downloader.module.install`, `downloader.module.uninstall`, `downloader.module.rollback` |
| **Guild Core** (6) | `guild.dashboard.get`, `guild.summaries.list`, `guild.module.toggle`, `guild.config.set`, `guild.setup.run`, `guild.settings.set` |
| **Permits** (6) | `guild.permits.list`, `guild.permits.create`, `guild.permits.update`, `guild.permits.delete`, `guild.permits.assign`, `guild.permits.unassign` |
| **Moderation & Appeals** (11) | `guild.cases.list`, `guild.cases.revoke`, `guild.warnThresholds.list`, `guild.warnThresholds.set`, `guild.modNotes.list`, `guild.modNotes.add`, `guild.modNotes.remove`, `guild.appeals.verify`, `guild.appeals.submit`, `guild.appeals.list`, `guild.appeals.review` |
| **Security & Backups** (8) | `guild.panic.get`, `guild.panic.set`, `guild.verificationPanel.get`, `guild.verificationPanel.set`, `guild.verificationPanel.delete`, `guild.verificationWeb.complete`, `guild.backups.list`, `guild.backups.restore` |
| **Temp Voice Channels** (3) | `guild.tempvc.generators.list`, `guild.tempvc.generators.set`, `guild.tempvc.records.list` |
| **Audit & History** (3) | `guild.audit.list`, `guild.history.list`, `guild.history.rollback` |
| **Overrides** (2) | `guild.overrides.list`, `guild.overrides.set` |
| **Guild Blocklist** (3) | `guild.blocklist.list`, `guild.blocklist.add`, `guild.blocklist.remove` |
| **Guild Advanced** (5) | `guild.afk.list`, `guild.ignored.list`, `guild.ignored.add`, `guild.ignored.remove`, `guild.moduleData.list` |
| **System Administration** (10) | `system.dashboard.get`, `system.maintenance.set`, `system.module.toggle`, `system.module.clear`, `system.identity.set`, `system.audit.list`, `system.blocklist.list`, `system.blocklist.add`, `system.blocklist.remove`, `system.shards.get` |

---

## Authentication & Authorization

- **Library**: [NextAuth.js (Auth.js v5)](https://authjs.dev) with Discord OAuth2 provider (`src/lib/auth.ts`).
- **OAuth2 Scopes**: `identify guilds`.
- **JWT Sessions**: Encrypted using `DASHBOARD_SESSION_SECRET` with an 8-hour maximum lifetime.
- **Authorization Cache**: Guild management permissions and bot-owner status are refreshed at most once per 5 minutes (`AUTHZ_TTL_MS = 300_000`), protecting against token stampedes.
- **Guards**:
  - `requireSession()`: Redirects unauthenticated users to `/login`.
  - `requireGuild(guildId)`: IDOR guard verifying Manage Server permission for `guildId`. Throws `notFound()` if unauthorized.
  - `requireBotOwner()`: Protects the `/system` tree using `PermitResolver.isBotOwner`.

---

## Running the Dashboard

```bash
# Start development server on port 3000
turbo run dev --filter=@lumi/dashboard

# Or directly with Bun
bun run --cwd apps/dashboard dev
```

```bash
# Build and typecheck
turbo run build --filter=@lumi/dashboard
turbo run typecheck --filter=@lumi/dashboard

# Run tests (Vitest + Testing Library)
bun run --cwd apps/dashboard test

# Run linter
bun run --cwd apps/dashboard lint
```


