# Architecture

## Layout

```
src/                      deployable process: entry, composition root, dispatch,
                          built-in commands, Lumi control panel
  core/                   gateway, sharding, HTTP control server, scheduler
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
- `src/core/` — Gateway, sharding, HTTP control server, scheduler, lifecycle
- `src/admin/` — Module management, config, `/lumi` panel, owner commands

**Toggleable Modules** (enable/disable per guild via `/lumi` → Modules).
Every module under `modules/` is a supermodule; its submodules toggle
independently:
- `community` — `leveling` (XP, ranks, voice XP, role rewards, leaderboards),
  `economy` (currency, banking, shop, jobs, gambling)
- `moderation` — `mod` (case-backed ban, kick, timeout, warn, purge, notes,
  lockdown, quarantine)
- `logging` — `logs` (message, edit, delete, voice, moderation logging)
- `security` — `antinuke`, `join-gate`, `verification`, `panic`, `backups`,
  `betrayal`, `autorecovery`, `automod`
- `utility` — `afk` (AFK status + mention replies), `tempvc` (join-to-create
  voice channels), `info` (avatar, banner, whois, serverinfo, nick, purge)

## Dependency direction

```
foundation (pino)
redis <- cache
      <- db <- module-kit <- module-runtime <- downloader
                                          <- src
ui (discord.js builders) <- module-kit
built-in services (core, admin) <- src
toggleable modules (module-kit + db + redis + ui) <- src
```

Rules:

- `foundation` imports no other Lumi package.
- `cache` and `db` never import `src` or `modules`.
- `module-runtime` and `downloader` never import `src` or `modules`.
- Only `src` constructs services and owns the process lifecycle.
- Built-in services live in `src/` and are non-disableable.
- Toggleable modules live in `modules/<supermodule>/<submodule>/` and are
  ordinary modules: discovered, validated, toggleable, reloadable.

## Boot order

1. `src/index.ts` creates the Discord client and logger.
2. `createCoreServices()` connects Redis, starts the invalidation bus, builds the
   cache namespaces, the Prisma handle, and repositories.
3. The app builds a `ModuleLoader` with the bundled and add-on roots, a
   `CommandRegistry`, and a `ModuleHost`, then an `AddonManager` bound to it.
4. Services are composed and shared with modules and the admin panel.
5. `host.load()` discovers roots, resolves dependencies, imports entries,
   attaches listeners, and registers commands.
6. The metrics server starts (`/metrics`, `/healthz`).
7. `client.login()`.
8. On ready: register global slash commands (built-ins + loaded modules). Any
    later module change re-registers them through the loader's `onChange` hook.

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