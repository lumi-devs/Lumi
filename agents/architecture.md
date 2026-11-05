# Architecture

## Layout

```
src/                      deployable process: entry, composition root, dispatch,
                          built-in commands, Lumi control panel
  core/                   gateway, lifecycle, interaction/prefix dispatch,
                          built-in commands, RPC control server, service wiring
  admin/                  module management, config, /lumi panel
modules/                  bundled feature modules (toggleable)
  <supermodule>/          manifest.json (group metadata only)
    <submodule>/          manifest.json + entry + feature files
packages/permits/         Built-in: permit evaluation, time-based, conditions
packages/cache/           L1 LRU + Redis L2 cache, codec, single-flight
packages/redis/           ioredis client, keys, TTLs, invalidation bus, locks
packages/db/              Prisma schema, client, repositories
packages/foundation/      shared pino logger
packages/module-kit/      module/command/listener/context/service contracts
packages/module-runtime/  discovery, manifest validation, loader, lifecycle
packages/downloader/      git repository manager, addon validation, installs
packages/ui/              card builders, palette, layout helpers
packages/observability/   Prometheus registry, metrics, /metrics + /healthz
packages/scheduler/       distributed cron with Redis locks
```

## Three workspace roots, three responsibilities

- `src/` — the process. It wires dependencies, owns the lifecycle, and is never
  imported by anything else.
- `modules/*` — first-party product features (toggleable submodules grouped by
  rudimentary supermodule directories). Submodules are ordinary modules loaded
  by the module runtime at boot, exactly like addons, and may not import the app.
  Supermodules contain no code and no config; the loader synthesizes display-only
  containers for them.
- `packages/*` — reusable libraries with narrow, declared dependencies. They
  never import the app or bundled modules.

## Built-in Services vs Toggleable Modules

**Built-in Services** (always running, non-disableable):

- `src/core/` — Gateway, lifecycle, interaction/prefix dispatch, built-in
  commands, RPC control server, service wiring
- `src/admin/` — Module management, config, `/lumi` panel, owner commands

**Toggleable Modules** (enable/disable per guild via `/lumi` → Modules).
Every submodule under `modules/<supermodule>/<submodule>/` toggles independently.
The supermodule directory is only a grouping label; it has no code, config, or
enable state.

- `community` — `leveling` (XP, ranks, voice XP, role rewards, leaderboards),
  `economy` (currency, banking, rewards, shop), `stats` (message/voice/member
  tracking and cards), `tickets` (private-thread ticket panels)
- `custom-commands` — `core` (guild-authored commands, schedules, KV)
- `logging` — `logs` (message, edit, delete, voice, moderation logging)
- `moderation` — `mod` (case-backed ban, kick, timeout, warn, purge, notes,
  lockdown, quarantine, softban, voice mute)
- `role-menus` — `menu` (button/select/reaction role menus)
- `roles` — `autorole`, `bulkrole`, `voiceroles`
- `security` — `core` (shared security settings), `antinuke`, `automod`,
  `autorecovery`, `backups`, `betrayal`, `join-gate`, `panic`, `verification`
- `utility` — `afk` (AFK status + mention replies), `nick` (nickname changes
  with hierarchy checks), `tempvc` (join-to-create voice channels), `info`
  (avatar, banner, whois, serverinfo), `reminders`

## Dependency direction

```
foundation        (pino)
observability     (prom-client)
redis             (ioredis) <- scheduler, permits
db                (prisma, pg) <- downloader
module-kit        (discord.js) <- module-runtime <- downloader
ui                (discord.js, canvas)
cache             (devalue; Redis-shaped port injected at runtime)

all packages <- src
```

Rules:

- `foundation` imports no other Lumi package.
- `cache`, `db`, `redis`, `scheduler`, `permits`, `observability` and `ui`
  never import `src` or `modules`.
- `module-runtime` and `downloader` never import `src` or `modules`.
- Only `src` constructs services and owns the process lifecycle.
- Built-in services live in `src/` and are non-disableable.
- Toggleable modules live in `modules/<supermodule>/<submodule>/` and are
  ordinary modules: discovered, validated, toggleable, reloadable. Supermodule
  directories contain only a thin manifest and are not loaded as code.

## Boot order

The exact wiring lives in `src/index.ts`; see [services.md](./services.md) for the
service contracts and the projection rule. In order:

1. `src/index.ts` creates the Redis client (`redisOptionsFromEnv()`) and connects
   it, then connects the database, then creates the Discord client. (The logger
   is created when `@lumi/core` is imported, before boot.)
2. `createCoreServices()` builds the invalidation bus, the cache namespaces, the
   `ConfigService`, the `PermitRepository`, the distributed scheduler, the
   health monitor, and the `@lumi/db` helper tree. Redis and Discord readiness
   checks are registered on the monitor.
3. The module loader gets the bundled (`modules`) and add-on (`data/addons`)
   roots. The RPC control server starts from `createRpcRouter()`
   (`/healthz`, `/ready`, `/api/v1/...`); the metrics server starts on
   `METRICS_PORT` unless `METRICS_ENABLED=false` (`/metrics`, `/healthz`).
4. The `ModuleHost`, `CommandRegistry`, `ModuleManager`, `AddonManager`, and the
   single `BotServices` object are constructed. Built-in commands are registered
   with `module: null`.
5. `loader.discover()` reads manifests; `host.load()` resolves dependencies,
   imports entries, runs `onLoad`, attaches listeners, registers commands, and
   resyncs guild commands.
6. The `addons-autoupdate` job is registered on the scheduler.
7. `registerClientEvents()` wires Discord event handlers, then `client.login()`
   runs.
8. On ready: every guild's record and module state are synced, slash commands are
   registered **per guild**, and the scheduler starts.
9. `registerShutdownHandlers()` installs the ordered shutdown steps.

## Process model

One process today. The cache is multi-replica ready: every write invalidates
Redis and publishes the exact keys; subscribers clear their local LRU and mark
in-flight loads stale. No process-local assumption is required for correctness.

## Multi-process Fleet (Planned)

- Manager process: shard allocation, health monitoring, rolling deployments
- Worker processes: handle assigned shards, connect to Discord gateway
- Shared state: Redis (cache, pub/sub, locks), PostgreSQL (source of truth)
- Internal control server: token-guarded HTTP health and status endpoints

## Dashboard ↔ Bot Communication (RPC)

The web dashboard (`apps/dashboard`) is a **separate SvelteKit process** that does not
connect to Discord and does not query the database for live data. It communicates
exclusively through the bot's **internal RPC control server** (default `127.0.0.1:8091`).

### Why RPC instead of direct DB access

- **Single source of truth for live state**: The bot holds guild cache, member
  state, loaded modules, and command registrations in memory. The database is
  only for durable config; live state lives in the bot process.
- **Dynamic node catalog**: Permit nodes come from loaded module commands
  (`requiredPermit`), built-in permits, and custom permits. Only the bot knows
  which modules are loaded and what nodes they expose.
- **Decoupled deployments**: Dashboard can be updated/restarted independently.
  Bot can run without dashboard; dashboard can run without bot (with cached data).
- **Security**: The listener binds to `127.0.0.1` by default. All `/api/v1/*`
  endpoints require `RPC_INTERNAL_TOKEN` unless the request socket is loopback;
  a token is mandatory for container or remote deployments. Health endpoints
  remain unauthenticated so orchestrators can probe them.
- **Credential split**: The dashboard does not use the bot's RPC for Discord
  operations. It holds its own `BOT_TOKEN` only for the Discord REST calls it
  needs (role/channel reads and verification role changes).

### RPC Endpoints

| Endpoint                                        | Auth   | Purpose                                                                            |
| ----------------------------------------------- | ------ | ---------------------------------------------------------------------------------- |
| `GET /healthz`                                  | —      | Liveness + dependency checks                                                       |
| `GET /ready`                                    | —      | Readiness (Discord gateway ready)                                                  |
| `GET /api/v1/status`                            | Bearer | Bot identity, guild count, loaded modules                                          |
| `GET /api/v1/permits/nodes?guild_id=`           | Bearer | Dynamic node catalog (built-ins + module commands + custom)                        |
| `GET /api/v1/guilds/:id`                        | Bearer | Live guild info (name, icon, member count)                                         |
| `POST /api/v1/guilds/:id/modules/:module/state` | Bearer | Apply a module enable/disable change to the running bot (`{ "enabled": boolean }`) |

### Dashboard Data Flow

1. User visits `/guilds/:id/permits` on dashboard
2. Dashboard `load()` calls `fetchPermitNodes(guildId)` → `GET /api/v1/permits/nodes?guild_id=...`
3. Bot's `createPermitNodesHandler` calls `permitNodeCatalog(permits, moduleLoader, guildId)`:
   - Built-in permit nodes (from `@lumi/permits` constants)
   - All loaded module command `requiredPermit` nodes + namespace wildcards
   - Existing custom permit nodes from DB (via `PermitRepository.listPermits`)
4. Dashboard renders multi-select with all available nodes
5. On create, dashboard POSTs selected nodes to its own action → Prisma → DB
6. Bot's `PermitRepository` invalidates cache via Redis pub/sub; next check sees new permit

### Dashboard DB Usage

The dashboard **only** uses the database for:

- Persistent config it owns: OAuth sessions, audit log entries it writes
- Writing new permits/assignments (POST actions)
- Guild list for the guild selector (from `guild` table)

The dashboard **never** reads live bot state from the database.

## What was removed from v1

- i18n and the locale stack.
- Redis Cluster/Sentinel branches.
- The `core` module and the `essential`/`disableable` concept.
- The global `container` and dynamic imports inside repositories.
- Import-time Prisma/Redis construction.
