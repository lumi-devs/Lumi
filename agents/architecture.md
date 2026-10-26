# Architecture

## Layout

```
apps/bot/                 deployable process: entry, composition root, dispatch,
                          built-in commands, Lumi control panel
apps/bot/src/core/        Built-in: gateway, sharding, HTTP control server, scheduler
apps/bot/src/admin/       Built-in: module management, config, /lumi panel
modules/                  bundled feature modules (toggleable)
packages/permits/         Built-in: permit evaluation, time-based, conditions
packages/cache/           L1 LRU + Redis L2 cache, codec, single-flight
packages/redis/           ioredis client, keys, TTLs, invalidation bus, locks
packages/db/              Prisma schema, client, repositories
packages/foundation/      shared pino logger
packages/module-kit/      module/command/listener/context/service contracts
packages/module-runtime/  discovery, manifest validation, loader, lifecycle
packages/downloader/      git addon installer, validation, versioned installs
packages/ui/              card builders, palette, layout helpers
packages/observability/   Prometheus registry, metrics, /metrics + /healthz
packages/scheduler/       distributed cron with Redis locks
```

## Three workspace roots, three responsibilities

- `apps/*` — processes you run. They wire dependencies, own the process
  lifecycle, and are never imported by anything else.
- `modules/*` — first-party product features (toggleable). They are ordinary modules
  loaded by the module runtime at boot, exactly like addons, and may not import the app.
- `packages/*` — reusable libraries with narrow, declared dependencies. They
  never import the app or bundled modules.

## Built-in Services vs Toggleable Modules

**Built-in Services** (always running, non-disableable):
- `apps/bot/src/core/` — Gateway, sharding, HTTP control server, scheduler, lifecycle
- `apps/bot/src/admin/` — Module management, config, `/lumi` panel, owner commands

**Toggleable Modules** (enable/disable per guild via `/lumi` → Modules):
All modules under `modules/` are toggleable:
- `mod` — case-backed moderation (ban, kick, timeout, warn, purge, notes)
- `leveling` — XP, ranks, role rewards, leaderboards, rank cards
- `economy` — Currency, banking, shop, jobs, gambling, balance cards
- `utility` — avatar, banner, whois, serverinfo, nick, purge
- `tempvc` — Join-to-create voice channels with ownership
- `logging` — Message/edit/delete/voice/mod logging
- `welcome` — Join/leave messages, DM on join, auto-roles
- `reactionroles` — Button/reaction role menus
- `afk` — AFK status with mention replies
- `onboarding` — Rules screening, channel hints
- `sticky` — Sticky messages
- `sheets` — Spreadsheet automation (auto-responses, FAQs)

## Dependency direction

```
foundation (pino)
redis <- cache
      <- db <- module-kit <- module-runtime <- downloader
                                          <- apps/bot
ui (discord.js builders) <- module-kit
built-in services (core, admin) <- apps/bot
toggleable modules (module-kit + db + redis + ui) <- apps/bot
```

Rules:

- `foundation` imports no other Lumi package.
- `cache` and `db` never import `apps/bot` or `modules`.
- `module-runtime` and `downloader` never import `apps/bot` or `modules`.
- Only `apps/bot` constructs services and owns the process lifecycle.
- Built-in services live in `apps/bot/src/` and are non-disableable.
- Toggleable modules live in `modules/<name>/` and are ordinary modules:
  discovered, validated, toggleable, reloadable.

## Boot order

1. `apps/bot/src/index.ts` creates the Discord client and logger.
2. `createCoreServices()` connects Redis, starts the invalidation bus, builds the
   cache namespaces, the Prisma handle, and repositories.
3. The app builds `ModuleLoader`, `AddonInstaller`, then composes services.
4. Built-in services (core, admin) are wired directly.
5. `loader.load()` discovers roots, resolves semver dependencies, imports
   entries, wires listeners, and registers module commands.
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