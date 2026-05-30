# Lumi

A modular Discord bot built on [Bun](https://bun.sh) and [Sapphire v5](https://www.sapphirejs.dev/).
Lumi runs as a single process by default, but the same build can split into
separate gateway, worker, and scheduler roles for horizontal scale-out.

## Stack

- **Runtime:** Bun
- **Framework:** Sapphire v5 (discord.js v14)
- **Database:** PostgreSQL via Prisma (PgBouncer in front), ioredis for cache and locks
- **Messaging:** RabbitMQ for cross-process events and dashboard RPC; BullMQ for scheduled jobs
- **Validation:** Zod

## Layout

The repo is a Bun-workspace monorepo.

```
packages/
  core            the bot itself (@lumi/core) — commands, modules, services, data layer
  event-bus       pluggable transport (in-process, Redis Streams, or NATS JetStream)
  observability   logging, tracing, and metrics primitives
  sharding        cluster coordinator and shard planner
  contracts, sdk  shared types and helpers
apps/
  gateway         holds the Discord WebSocket, publishes raw events onto the bus
  worker          runs all command and module logic (no WebSocket of its own)
  scheduler       owns the BullMQ queue for delayed and repeated jobs
  api             dashboard RPC bridge
```

Each process picks its role from `LUMI_ROLE` (`monolith` by default, or `gateway` / `worker` /
`scheduler`). `TRANSPORT` selects the event bus backend: `inproc` for a self-contained monolith,
`streams` or `nats` to carry events between split roles.

## Running it

### Docker

A bare `docker compose up` starts the monolith — the bot plus Postgres, PgBouncer, Redis, and
RabbitMQ — on one host:

```bash
cp .env.example .env        # set BOT_TOKEN and CLIENT_ID
docker compose up
```

For hot reload while developing, start the dev service by name so it mounts your source and does
not also launch the production worker (which would log in twice on the same token):

```bash
docker compose up lumi-dev
```

Scale-out and extras are opt-in profiles:

```bash
docker compose --profile scale up -d            # split gateway/workers + shared REST proxy
docker compose --profile observability up -d     # Prometheus, Grafana, Tempo, OTel collector
docker compose --profile scale-nats up -d         # NATS JetStream transport
```

### Bare metal

Requires Bun 1.1+, PostgreSQL 16, and Redis 7 running locally.

```bash
bun install
bun run db:generate
bun run db:push
bun run dev
```

## Configuration

Environment variables are validated at boot. The important ones:

| Variable | Purpose |
| --- | --- |
| `BOT_TOKEN` | Discord bot token |
| `CLIENT_ID` | Discord application client ID |
| `OWNER_IDS` | Comma-separated bot-owner user IDs |
| `LUMI_ROLE` | Process role: `monolith` \| `gateway` \| `worker` \| `scheduler` |
| `TRANSPORT` | Event bus: `inproc` \| `streams` \| `nats` |
| `POSTGRES_URL` | Postgres connection (PgBouncer port `6432` in production) |
| `DIRECT_POSTGRES_URL` | Direct Postgres connection (used for migrations) |
| `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` | Redis connection |
| `DISCORD_PROXY_URL` | Optional REST proxy base URL (e.g. nirn-proxy) |

See `.env.example` for the full list.

## Scripts

| Command | What it does |
| --- | --- |
| `bun run dev` | Run the worker in watch mode (installs deps and generates the client first) |
| `bun run typecheck` | `tsc --noEmit` across the workspace |
| `bun run lint` | ESLint with `--fix` |
| `bun run test` | Vitest suite |
| `bun run db:push` | Push the Prisma schema to the database (development) |
| `bun run db:migrate` | Create a migration (production schema changes) |
| `bun run db:studio` | Open Prisma Studio |
| `bun run modules:manifest` | Regenerate module manifests |

## Modules

Features live in `packages/core/src/modules/<name>/`, each a self-contained module with its own
commands, listeners, services, and scheduled tasks. Modules can be enabled or disabled per guild,
and never import from one another — shared code goes in `core` or `utilities`. Database access goes
through `container.db` (the repositories under `packages/core/src/prisma/`), never Prisma directly,
and user-facing replies are built with the card helpers in `packages/core/src/utilities/cards.ts`.

## License

Apache 2.0. The license does not grant rights to the "Lumi" name or branding; redistributed builds
must be renamed.
