# Database

Package: `@lumi/db` (`packages/db`). Postgres + Prisma 7 + `@prisma/adapter-pg`.

## Layout

- `packages/db/src/index.ts` — the package's only source file. It builds the
  `pg.Pool`, the `PrismaPg` adapter, and the `prisma` singleton.
- `packages/db/prisma/schema.prisma` — models.
- `packages/db/prisma/migrations/` — versioned SQL migrations.
- `prisma.config.ts` (repo root) — points the Prisma CLI at the schema and
  migrations and resolves the URL from `DATABASE_URL`, `DIRECT_POSTGRES_URL`, or
  `POSTGRES_URL` (local fallback `postgresql://lumi:lumi@127.0.0.1:5432/lumi`).

There is no `client.ts`, `createDatabase()`, or `DatabaseService`. The generated
client is the default `@prisma/client` output.

## Client

`packages/db/src/index.ts` constructs the pool and client at import time, but
nothing connects until the first query or `connectDatabase()`. Exports:
`prisma`, `connectDatabase()`, `disconnectDatabase()`, and the `PrismaClient` /
`Prisma` types. `disconnectDatabase()` disconnects Prisma, then ends the pool,
logging (not rethrowing) failures; `src/index.ts` calls both during boot and
shutdown.

Schema and migration commands: `bun run db:generate` (generate client) and
`bun run db:migrate` (development). Apply versioned migrations in
production/CI with `prisma migrate deploy`; never use Redbot-style idempotent
DDL at boot. Additive changes first; destructive changes need an explicit
migration.

## Repositories

There is no shared repository container. Persistence lives with its domain:

- `packages/permits/src/repository.ts` — `PermitRepository`: permits,
  assignments, the per-target Redis quarantine marker, audit log, export/import.
- `src/admin/services/ConfigService.ts` — per-guild settings stored as JSON in
  `Guild.settings`, cached and invalidated through `NamespacedCache`.
- `src/admin/services/ModuleManager.ts` — per-guild enablement in `GuildModule`,
  mirrored into the in-process `ModuleLoader`.
- Modules query their own tables through the `PrismaClient` handed to them as
  `services.db`; they never construct Prisma.

Rules:

- Writes invalidate cache entries after the transaction commits.
- Use `$transaction` for multi-row invariants; do not read-modify-write counters.
- Never `upsert` on a read path; create rows on write.
- Do not import `@lumi/db` from addons; it is an internal package.

## Schema

`Guild`, `Permit`, `PermitAssignment`, `GuildModule`, `LevelingConfig`/
`LevelingUser`, `EconomyConfig`/`EconomyUser`/`EconomyTransaction`,
`TempVcConfig`/`TempVcChannel`, `AfkEntry`, `DownloaderRepo`/`DownloaderModule`,
and `AuditLog`.
