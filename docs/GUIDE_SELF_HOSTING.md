# Self-Hosting Guide

Running your own Lumi instance for a personal server or small community. This covers the single-replica path only - no sharding, no clustering, no HA. If you're outgrowing that (multiple guilds past a few thousand members, need for zero-downtime deploys, multiple worker replicas), see [Production Deployment](GUIDE_PRODUCTION_DEPLOYMENT.md) once you're done here.

## Prerequisites

| Dependency | Minimum | Notes |
| :--- | :--- | :--- |
| [Docker](https://docs.docker.com/get-docker/) + Docker Compose | any recent version | Easiest way to run Postgres, Redis, RabbitMQ, and (optionally) Lumi itself. Not required - see below. |
| [Bun](https://bun.sh) | `1.3.0+` | Always required, Docker or not. |
| A Discord application | - | Create one at the [Developer Portal](https://discord.com/developers/applications); you need its bot token and client ID. |

This guide's commands assume Docker for Postgres/Redis/RabbitMQ, since it's the fastest path. If you'd rather not use Docker at all, either run `nix develop` (provisions native Postgres/Redis/RabbitMQ binaries) or install those three yourself and point `.env` at them - Lumi itself is just a Bun process reading connection strings, nothing in the code requires Docker.

## 1. Create a Discord application

1. [Developer Portal](https://discord.com/developers/applications) → **New Application**.
2. **Bot** tab → **Reset Token**, copy it (you'll only see it once - `BOT_TOKEN`).
3. Under **Privileged Gateway Intents**, enable **Server Members Intent** and **Message Content Intent** if you plan to use prefix commands or member-based features (AFK, moderation, welcome messages).
4. **OAuth2 → General**, copy the **Client ID** (`CLIENT_ID`).
5. **OAuth2 → URL Generator**: scopes `bot` + `applications.commands`, then whatever bot permissions you need (Administrator is simplest for a personal server; scope it down for anything shared). Use the generated URL to invite the bot.

## 2. Clone and configure

```bash
git clone https://github.com/lumi-devs/lumi.git
cd lumi
bun run setup
```

`bun run setup` (`scripts/setup.sh`) interactively builds `.env` from `.env.example`, verifies your bot token against Discord's API, and offers to run `docker compose up -d` for you. If you'd rather do it by hand:

```bash
cp .env.example .env
$EDITOR .env   # fill in BOT_TOKEN, CLIENT_ID at minimum - see below
```

### Mandatory variables

| Variable | What to set |
| :--- | :--- |
| `BOT_TOKEN` | From step 1. |
| `CLIENT_ID` | From step 1. |
| `POSTGRES_PASSWORD` | Any password - also used by `docker-compose.yml`'s `postgres` service. |
| `POSTGRES_URL` / `DIRECT_POSTGRES_URL` | Defaults in `.env.example` (`postgresql://lumi:lumi@localhost:5432/lumi`) work as-is if you keep the default password. |
| `REDIS_PASSWORD` | Any password - also used by the `redis` service. |
| `RABBITMQ_USER` / `RABBITMQ_PASSWORD` | Any credentials - also used by the `rabbitmq` service. |

Everything else in `.env.example` has a working default for local use. See [Configuration Reference](configuration.md) for every variable, including the advanced sharding/clustering knobs you don't need for a single instance.

## 3. Start the backing services

```bash
docker compose up -d postgres pgbouncer redis rabbitmq
```

This starts:

| Service | Purpose |
| :--- | :--- |
| `postgres` | Primary database (`postgres:17`). |
| `pgbouncer` | Connection pooler in front of Postgres - `POSTGRES_URL` should point here (port 6432), not directly at `postgres`. |
| `redis` | Cache, rate limiting, cross-process invalidation, event bus transport. |
| `rabbitmq` | Dashboard ↔ worker RPC transport (only needed if you run the dashboard). |

Wait for them to report healthy:

```bash
docker compose ps
```

## 4. Provision the database

```bash
bun install
bun run db:generate   # Prisma Client codegen
bun run db:migrate     # applies prisma/schema.prisma
```

Use `db:migrate` (not `db:push`) even for self-hosting - it's the only path that creates a proper migration history, which matters the moment you ever need to roll back or upgrade.

## 5. Run it

**Option A - Docker (recommended for "just run the bot"):**

```bash
docker compose up -d worker
docker compose logs -f worker
```

**Option B - Bun directly (recommended if you're also developing):**

```bash
bun run dev
```

`bun run dev` runs `turbo run dev` across the workspace - by default that's just `worker`. The bot should appear online within a few seconds; slash commands can take up to an hour to propagate globally the *first* time they're registered (Discord-side caching), though guild-scoped test servers usually see them within a minute.

## 6. Optional: the web dashboard

The dashboard needs its own OAuth2 app credentials (can be the same Discord application) and RabbitMQ, which you already have running.

```bash
# .env additions
DASHBOARD_SESSION_SECRET=$(openssl rand -hex 32)
DISCORD_OAUTH2_CLIENT_ID=<same as CLIENT_ID, or a separate app>
DISCORD_OAUTH2_CLIENT_SECRET=<from OAuth2 tab>
DISCORD_OAUTH2_REDIRECT_URI=http://localhost:8080/callback
```

Register `http://localhost:8080/callback` as a valid redirect under **OAuth2 → Redirects** in the Developer Portal, then:

```bash
docker compose --profile dashboard up -d dashboard
```

Visit `http://localhost:8080`.

## 7. Optional: metrics and tracing

```bash
docker compose --profile observability up -d
```

Brings up `otel-collector`, `tempo`, `prometheus`, and `grafana`. Grafana is at `http://localhost:3001` (default login `admin`/`admin` - **change `GRAFANA_PASSWORD` in `.env` before exposing this beyond localhost**). Set `OTEL_ENABLED=true` in `.env` and restart `worker` to start exporting traces. See [Architecture](architecture.md#observability) for what's instrumented.

## Updating

```bash
git pull
bun install
bun run db:migrate
docker compose up -d --build worker   # or: bun run dev
```

Check `packages/core/CHANGELOG.md` (generated by [Changesets](https://github.com/changesets/changesets)) or GitHub Releases for anything migration-adjacent - schema changes are covered by `db:migrate`, but breaking config changes are called out in release notes.

## Backups

Postgres is the only stateful system of record (Redis holds cache/queue state that's safe to lose - it'll repopulate). At minimum:

```bash
docker compose exec postgres pg_dump -U lumi lumi > backup-$(date +%F).sql
```

Automate this with a cron job or your platform's volume-snapshot mechanism (`postgres-data` in `docker-compose.yml`).

## Troubleshooting

| Symptom | Likely cause |
| :--- | :--- |
| Worker exits immediately on boot | Missing/invalid `BOT_TOKEN` or `CLIENT_ID` - check the container logs, or re-run `bun run setup` to re-verify the token. |
| Worker starts but no slash commands appear | First registration can take up to an hour globally; test in a guild-scoped context for faster iteration, or check `docker compose logs worker` for registration errors. |
| `worker` can't reach Postgres | `pgbouncer` and `postgres` both need `condition: service_healthy` before `worker` starts - `docker compose ps` should show both `healthy`, not just `running`. |
| Dashboard OAuth2 login fails | `DISCORD_OAUTH2_REDIRECT_URI` must exactly match a redirect registered on the Discord application, including scheme and trailing slash. |

For anything not covered here, see [Architecture](architecture.md) for how the pieces fit together, or open a discussion on the [GitHub repo](https://github.com/lumi-devs/Lumi).
