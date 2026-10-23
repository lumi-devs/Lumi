# Architecture

## Layout

```
apps/bot/                 composition root, built-in commands/listeners, bundled modules
packages/contracts/       dependency-free control interfaces shared by all packages
packages/foundation/      logger, env, time, errors, concurrency
packages/observability/   Prometheus registry, metrics, /metrics + /healthz
packages/redis/           ioredis client, keys, TTLs, invalidation bus, locks
packages/cache/           L1 LRU + Redis L2 cache, codec, single-flight
packages/db/              Prisma schema, client, services, repositories
packages/module-kit/      module/command/listener/context/service contracts
packages/modules/         discovery, manifest validation, loader, lifecycle
packages/downloader/      git addon installer, validation, versioned installs
packages/ui/              card builders, palette, layout helpers
```

## Dependency direction

```
contracts <- foundation <- observability
                       <- redis <- cache
                                 <- db <- module-kit <- modules <- downloader
                                                                  <- apps/bot
ui (foundation + discord.js builders) <- module-kit
```

Rules:

- `contracts` imports nothing from this repo.
- `foundation` imports no other Lumi package.
- `cache` and `db` never import `apps/bot`.
- `modules` and `downloader` never import `apps/bot`.
- Only `apps/bot` constructs services and owns the process lifecycle.
- Bundled modules live in `apps/bot/src/modules/<name>/` and are ordinary
  modules: discovered, validated, toggleable, reloadable.

## Boot order

1. `apps/bot/src/index.ts` creates the Discord client and logger.
2. `createCoreServices()` connects Redis, starts the invalidation bus, builds the
   cache namespaces, the Prisma handle, and `DatabaseService`.
3. The app builds `AddonInstaller` and `ModuleLoader`, then `composeServices()`.
4. Built-in listeners/commands are wired directly in `apps/bot/src/app.ts`.
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

## What was removed from v1

- i18n and the locale stack.
- Sticky and welcome modules.
- Redis Cluster/Sentinel branches.
- The `core` module and the `essential`/`disableable` concept.
- The global `container` and dynamic imports inside repositories.
- Import-time Prisma/Redis construction.
