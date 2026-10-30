# Operations

## Toolchain

Use the flake:

```sh
nix develop
bun install
bun run typecheck
bun run test
```

Bun is 1.4.2 from nixpkgs. Do not use `Bun.SQL` (1.4.2 has pipeline/transaction
bugs fixed in 1.4.3). Prisma + `pg` is the supported database path.

## Environment

See `.env.example`.

| Variable              | Purpose                                                           |
| --------------------- | ----------------------------------------------------------------- |
| `BOT_TOKEN`           | Discord bot token (required; boot exits without it).              |
| `OWNER_IDS`           | Comma-separated user IDs allowed to run owner commands.           |
| `DATABASE_URL`        | Postgres connection string; first choice for Prisma and the app.  |
| `DIRECT_POSTGRES_URL` | Fallback Postgres URL when `DATABASE_URL` is unset.               |
| `POSTGRES_URL`        | Last-resort Postgres URL; also used by `docker-compose.yml`.      |
| `REDIS_URL`           | Full Redis URL; takes precedence over the discrete vars below.    |
| `REDIS_HOST`          | Redis host when `REDIS_URL` is unset. Default `localhost`.        |
| `REDIS_PORT`          | Redis port when `REDIS_URL` is unset. Default `6379`.             |
| `REDIS_PASSWORD`      | Redis password when `REDIS_URL` is unset.                         |
| `CACHE_NAMESPACE`     | Root cache-key namespace. Default `lumi`.                         |
| `DEFAULT_PREFIX`      | Prefix command fallback. Default `,`.                             |
| `LOG_LEVEL`           | pino level. Default `info`.                                       |
| `METRICS_ENABLED`     | Set to `false` to disable the metrics server.                     |
| `METRICS_PORT`        | `/metrics` and `/healthz` port. Default `9090`.                   |
| `RPC_HTTP_HOST`       | RPC control-server bind host. Default `0.0.0.0`.                  |
| `RPC_HTTP_PORT`       | RPC control-server port. Default `8091`.                          |
| `RPC_INTERNAL_TOKEN`  | Bearer token for `/api/v1/status`; when unset, the route is open. |
| `GIT_TOKEN`           | Optional token for private addon repos over HTTPS.                |
| `GIT_USERNAME`        | Token username; default `x-access-token`.                         |

## Local services

```sh
docker compose up -d
bunx prisma migrate deploy
bun run db:generate
bun run dev:bot
```

## Database

- `prisma.config.ts` supplies the schema path, migrations path, and URL
  (`DATABASE_URL` → `DIRECT_POSTGRES_URL` → `POSTGRES_URL`).
- `bun run db:generate` after schema edits.
- `bun run db:migrate` in development.
- `bunx prisma migrate deploy` in production/CI.
- `packages/db/prisma/migrations/` is versioned; never edit an applied migration.
- The generated client uses Prisma's default `@prisma/client` output.

## Metrics

Recorded today: cache hit/miss/negative/write/eviction/invalidation, cache fill
duration, stale writes, guild/user/shard/active-module gauges, command
executions, and RPC HTTP request counts and latency.

The registry also defines DB query duration/count, Redis command duration, pg
pool size/used/waiting, and economy transaction metrics. Those are declared but
not yet instrumented.

Health: `GET /healthz` returns `{ ok, ready, checks }` on the RPC server; the
metrics server's `/healthz` returns `{ ok }` from the readiness callback.
Metrics: `GET /metrics` on `METRICS_PORT`.

## Process lifecycle

- Addon installs may reach the npm registry to install manifest `requirements`;
  `bun add` runs with `--production --ignore-scripts --no-save`.
- SIGINT/SIGTERM: stop the metrics server, RPC server, and scheduler,
  `host.unloadAll()`, shut down Discord, close the invalidation bus, disconnect
  Prisma and the pg pool, then quit Redis.
- One process today. Cache invalidation is pub/sub based, so multiple replicas can
  be added without changing cache keys.
