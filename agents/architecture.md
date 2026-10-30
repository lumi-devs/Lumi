# Architecture

## Layout

```
src/                      deployable process: entry, composition root, dispatch,
                          built-in commands, Lumi control panel
  core/                   gateway, lifecycle, interaction/prefix dispatch,
                          built-in commands, RPC control server, service wiring
  admin/                  module management, config, /lumi panel
modules/                  bundled feature modules (toggleable)
  <supermodule>/          manifest.json + index.ts
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
- `modules/*` — first-party product features (toggleable). They are ordinary
  modules loaded by the module runtime at boot, exactly like addons, and may not
  import the app.
- `packages/*` — reusable libraries with narrow, declared dependencies. They
  never import the app or bundled modules.

## Built-in Services vs Toggleable Modules

**Built-in Services** (always running, non-disableable):

- `src/core/` — Gateway, lifecycle, interaction/prefix dispatch, built-in
  commands, RPC control server, service wiring
- `src/admin/` — Module management, config, `/lumi` panel, owner commands

**Toggleable Modules** (enable/disable per guild via `/lumi` → Modules).
Every module under `modules/` is a supermodule; its submodules toggle
independently:

- `community` — `leveling` (XP, ranks, voice XP, role rewards, leaderboards),
  `economy` (currency, banking, rewards, shop)
- `moderation` — `mod` (case-backed ban, kick, timeout, warn, purge, notes,
  lockdown, quarantine, softban, voice mute)
- `logging` — `logs` (message, edit, delete, voice, moderation logging)
- `security` — `antinuke`, `join-gate`, `verification`, `panic`, `backups`,
  `betrayal`, `autorecovery`, `automod`
- `utility` — `afk` (AFK status + mention replies), `nick` (nickname changes
  with hierarchy checks), `tempvc` (join-to-create voice channels), `info`
  (avatar, banner, whois, serverinfo)

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
  ordinary modules: discovered, validated, toggleable, reloadable.

## Boot order

1. `src/index.ts` creates the Redis client (`redisOptionsFromEnv()`) and connects
   it, then connects the database, then creates the Discord client. (The logger
   is created when `@lumi/core` is imported, before boot.)
2. `createCoreServices()` builds the invalidation bus, the cache namespaces, the
   `ConfigService`, the `PermitRepository`, the distributed scheduler, and the
   health monitor. Redis and Discord readiness checks are registered on the
   monitor.
3. The module loader gets the bundled (`modules`) and add-on (`data/addons`)
   roots. The RPC control server starts (`/healthz`, `/ready`,
   `/api/v1/status`); the metrics server starts on `METRICS_PORT` unless
   `METRICS_ENABLED=false` (`/metrics`, `/healthz`).
4. The `ModuleHost`, `CommandRegistry`, `ModuleManager`, `AddonManager`, and the
   shared `services` bag are constructed. Built-in commands are registered with
   `module: null`.
5. `loader.discover()` reads manifests; `host.load()` resolves dependencies,
   imports entries, runs `onLoad`, attaches listeners, registers commands, and
   resyncs guild commands.
6. The `addons-autoupdate` job is registered on the scheduler and the scheduler
   starts.
7. Discord event handlers are wired, then `client.login()` runs.
8. On ready: every guild's record and module state are synced, slash commands are
   registered **per guild**, and the global command set is cleared.

## Process model

One process today. The cache is multi-replica ready: every write invalidates
Redis and publishes the exact keys; subscribers clear their local LRU and mark
in-flight loads stale. No process-local assumption is required for correctness.

## Multi-process Fleet (Planned)

- Manager process: shard allocation, health monitoring, rolling deployments
- Worker processes: handle assigned shards, connect to Discord gateway
- Shared state: Redis (cache, pub/sub, locks), PostgreSQL (source of truth)
- Internal control server: token-guarded HTTP health and status endpoints

## What was removed from v1

- i18n and the locale stack.
- Redis Cluster/Sentinel branches.
- The `core` module and the `essential`/`disableable` concept.
- The global `container` and dynamic imports inside repositories.
- Import-time Prisma/Redis construction.
