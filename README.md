# Lumi

![Lumi](assets/banner.png)

Lumi is a self-hosted Discord bot for moderation, community features, and
server security. It runs as a single Bun process and uses PostgreSQL and Redis.
A separate SvelteKit dashboard lives in `apps/dashboard`.

The v2 branch is still in development. Expect schema and configuration changes
between releases.

## What it does

- Moderation with cases, bans, kicks, timeouts, warnings, notes, purge, channel
  locks, quarantine, and voice moderation.
- Numbered permits with schedules, conditions, role and channel assignments,
  and optional manager bypass rules.
- Security features including anti-nuke, automod, join gate, verification,
  panic mode, backups, and auto-recovery.
- Community tools for leveling, economy, stats, temp voice, AFK, nicknames, and
  quote images.
- Custom commands with triggers, key-value storage, and cron or interval
  schedules.
- Ticket threads with categories, staff roles, claims, priorities, feedback,
  and HTML transcripts.
- Role menus, autorole, voice roles, and resumable bulk role jobs.
- A web dashboard for guild configuration, permits, cases, security, stats, and
  web verification.

## Requirements

- Docker Compose, or Bun 1.4.2+ with PostgreSQL 18+ and Redis 8+
- A Discord application with the Server Members, Message Content, and Presence
  intents enabled

## Docker

The image is published to `ghcr.io/lumi-devs/lumi`.

```sh
cp .env.example .env
# Set BOT_TOKEN, OWNER_IDS, POSTGRES_PASSWORD, REDIS_PASSWORD, and
# RPC_INTERNAL_TOKEN in .env.
docker compose pull
docker compose --profile migrate run --rm migrate
docker compose up -d
```

Pin `LUMI_TAG` to a release tag in production. Pushes to `v2/develop` publish
`v2-develop` and commit tags. Stable releases also publish the version tags and
move `latest`.

## From source

```sh
nix develop
bun install
bun run setup
bun run dev:bot
```

`bun run setup` writes `.env`, checks PostgreSQL and Redis, generates the
Prisma client, and applies migrations. See [SETUP.md](SETUP.md) for manual
installs, systemd, and other platforms.

## Dashboard

The dashboard deploys separately from the bot. It needs a Discord OAuth2
application and the bot RPC settings.

```sh
bun install
bun run db:generate
cp apps/dashboard/.env.example apps/dashboard/.env
# Fill in the Discord, database, Redis, and session values.
bun run dashboard:dev
```

Use `bun run dashboard:build` for a production build. Keep the dashboard and
bot on the same release tag.

## Development

```sh
bun run typecheck
bun run dashboard:typecheck
bun run test
bun run build
bun run dashboard:build
```

Formatting uses Prettier and linting uses Biome:

```sh
bun run format
bun run lint
```

## Documentation

- [SETUP.md](SETUP.md) covers installation and configuration.
- [AGENTS.md](AGENTS.md) and [agents/00-index.md](agents/00-index.md) document
  the codebase for contributors and coding agents.
