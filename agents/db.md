# Database

Package: `@lumi/db` (`packages/db`). Postgres + Prisma 7 + `@prisma/adapter-pg`.

## Layout

- `packages/db/src/index.ts` — builds the `pg.Pool`, the `PrismaPg` adapter, and
  the `prisma` singleton; exports `createDbHelpers(redis)`.
- `packages/db/src/cache.ts` — the Redis-backed `CacheFacade` used by helpers.
- `packages/db/src/helpers/` — domain helpers: `leveling`, `economy`, `stats`,
  `tickets`, `roleMenus`, `customCommands`, `roles`, `security`,
  `verification`, `utility`, plus the `cache` namespace.
- `packages/db/prisma/schema.prisma` — models.
- `packages/db/prisma/migrations/` — versioned SQL migrations.
- `prisma.config.ts` (repo root) — points the Prisma CLI at the schema and
  migrations and reads the connection URL from `DATABASE_URL`.

There is no `client.ts`, `createDatabase()`, or `DatabaseService`. The generated
client is the default `@prisma/client` output.

## Client

`packages/db/src/index.ts` constructs the pool and client at import time, but
nothing connects until the first query or `connectDatabase()`. Exports:
`prisma`, `connectDatabase()`, `disconnectDatabase()`, `createDbHelpers()`, and
the `PrismaClient` / `Prisma` types. `disconnectDatabase()` disconnects Prisma,
then ends the pool, logging (not rethrowing) failures; `src/index.ts` calls both
during boot and shutdown.

Schema and migration commands: `bun run db:generate` (generate client) and
`bun run db:migrate` (development). Apply versioned migrations in
production/CI with `prisma migrate deploy`; never use Redbot-style idempotent
DDL at boot. Additive changes first; destructive changes need an explicit
migration.

## Helpers

`createCoreServices()` builds one helper tree and exposes it as
`services.helpers`. It is the only database/cache surface available to modules
and add-ons:

```ts
services.helpers.economy.getBalance(guildId, userId);
services.helpers.leveling.addXp(guildId, userId, { xp, totalXp });
services.helpers.tickets.findTicketByChannel(channelId);
services.helpers.cache.incr(`key`, 60_000);
```

Helpers own Prisma access, validation, transactions, cache invalidation, and
the Redis key layout. Modules never import `@prisma/client`, `@lumi/db`,
`@lumi/cache`, `@lumi/redis`, or `ioredis` directly; Biome enforces this for
`modules/**` through `noRestrictedImports`.

## Repositories

Persistence lives with its domain:

- `packages/db/src/helpers/` — the module-facing database/cache API.
- `packages/permits/src/repository.ts` — `PermitRepository`: permits,
  assignments, the per-target Redis quarantine marker, audit log, export/import.
- `src/admin/services/ConfigService.ts` — per-guild settings stored as JSON in
  `Guild.settings`, cached and invalidated through `NamespacedCache`.
- `src/admin/services/ModuleManager.ts` — per-guild enablement in `GuildModule`,
  mirrored into the in-process `ModuleLoader`.

Rules:

- Writes invalidate cache entries after the transaction commits.
- Use `$transaction` for multi-row invariants; do not read-modify-write counters.
- Use conditional `updateMany` plus a `count` check for claims, leases, and
  progress transitions (tickets, bulk-role jobs, leveling) instead of reading a
  row and then writing it unconditionally. A zero count means another worker
  won the race; do not report success.
- Never `upsert` on a read path; create rows on write.
- Do not import `@lumi/db` from addons; it is an internal package.
- Add a new helper instead of exposing Prisma to a module.

## Schema

`Guild`, `Permit`, `PermitAssignment`, `GuildModule`, `LevelingConfig`/
`LevelingUser`, `EconomyConfig`/`EconomyUser`/`EconomyTransaction`,
`TempVcConfig`/`TempVcChannel`, `AfkEntry`, `DownloaderRepo`/`DownloaderModule`,
and `AuditLog`.
