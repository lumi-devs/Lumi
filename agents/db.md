# Database

Package: `@lumi/db` (`packages/db`). Postgres + Prisma 7 + `@prisma/adapter-pg`.

## Schema and migrations

- Schema: `packages/db/prisma/schema.prisma`.
- CLI config: `prisma.config.ts` (datasource URL from `POSTGRES_URL`).
- Generated client: `packages/db/generated/client` (gitignored).
- Migrations are versioned SQL under `packages/db/prisma/migrations`. Generate with
  `bun run db:generate`; apply with `bun run db:migrate` (development) or
  `bun run db:deploy` (production/CI).
- Do **not** adopt Redbot-style idempotent DDL executed at boot.
- Additive changes first. Destructive changes need an explicit migration plan.

## Client construction

`createDatabase()` (`packages/db/src/client.ts`) is the only place that creates
pools or `PrismaClient`. It takes the URL, optional replica URL, pool size, app
name, and logger. Nothing connects at import time.

## Repositories

`DatabaseService` exposes:

- `guild` — guild row cache, ensure, prefix, left/rejoin, active/purge.
- `config` — per-module config maps, scoped values, writes with optional history.
- `modules` — global/guild enablement, effective `isEnabled`.
- `moduleData` — namespaced module KV with expiry.
- `afk` — AFK entries.
- `downloader` — repo and installed-module records.

Rules:

- Modules receive `services.db`; they never construct Prisma.
- Reads go through the repositories so caching and invalidation stay consistent.
- Never `upsert` on a read path. Create rows on write.
- Writes invalidate **after** the transaction commits.
- Use `$transaction` for multi-row invariants. Do not read-modify-write counters.
- Use `reader` for read-only list/iteration paths when a replica is configured.
- Do not import `@lumi/db` from addons; it is an internal package.

## Config resolution

Effective module enablement = global state AND guild state. There is no config
key gate; `ModuleStateRepository.isEnabled()` is the single implementation.
Cached keys:

- `lumi:mod:global:<module>`
- `lumi:mod:<guild>:<module>`

Any write that can change the result invalidates the matching key(s).

## Module data expiry

`moduleData.get` caches an envelope (`value` + `expiresAt`) and checks the expiry
on every read, so a row expiring inside the cache TTL is never served stale. A
miss is negative-cached for 15 seconds.
