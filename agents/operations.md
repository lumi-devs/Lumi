# Operations

## Toolchain

Use the flake:

```sh
nix develop
bun install
bun run typecheck
bun test
```

Bun is 1.4.2 from nixpkgs. Do not use `Bun.SQL` (1.4.2 has pipeline/transaction
bugs fixed in 1.4.3). Prisma + `pg` is the supported database path.

## Environment

See `.env.example`.

| Variable | Purpose |
| --- | --- |
| `BOT_TOKEN` | Discord bot token (required). |
| `OWNER_IDS` | Comma-separated user IDs allowed to run owner commands. |
| `POSTGRES_URL` | Postgres connection string (required). |
| `REDIS_URL` | Redis URL. Default `redis://localhost:6379/0`. |
| `CACHE_NAMESPACE` | Redis key prefix. Default `lumi`. |
| `DEFAULT_PREFIX` | Prefix command fallback. Default `,`. |
| `LOG_LEVEL` | pino level. |
| `METRICS_PORT` | `/metrics` and `/healthz` port. Default `9090`. |
| `GIT_TOKEN` | Optional token for private addon repos over HTTPS. |
| `GIT_USERNAME` | Token username; default `x-access-token`. |
| `LUMI_ROOT` | Repo root for `data/`; default `process.cwd()`. |

## Local services

```sh
docker compose up -d
bun run db:deploy
bun run dev
```

## Database

- `prisma.config.ts` supplies the schema path, migrations path, and
  `POSTGRES_URL` to the Prisma CLI.
- `bun run db:generate` after schema edits.
- `bun run db:migrate` in development.
- `bun run db:deploy` in production/CI.
- `packages/db/prisma/migrations/` is versioned; never edit an applied migration.
- The client lives in `packages/db/generated/client` and is gitignored.

## Metrics

Prometheus metrics include cache hit/miss/negative/write/eviction/invalidation,
cache fill duration, stale writes, DB query duration by model/operation/role,
Redis command duration, and pool size/used/waiting.

Health: `GET /healthz` returns `{ ok }` based on the app's readiness callback.
Metrics: `GET /metrics`.

## Process lifecycle

- Addon installs may reach the npm registry to install manifest `requirements`;
  `bun install` runs with `--production --ignore-scripts --no-save`.
- SIGINT/SIGTERM: stop metrics server, `loader.unloadAll()`, close Redis, close
  Prisma.
- One process today. Cache invalidation is pub/sub based, so multiple replicas can
  be added without changing cache keys.
