# Lumi v2

A Discord bot focused on moderation, community tooling, security, and server
insights, written in TypeScript and running on Bun.

## Features

- **Moderation** — bans, kicks, timeouts, warnings, notes, cases, channel locks,
  quarantine, purge, voice moderation, and warning escalation rules.
- **Permits** — Wick-style numbered permits with fixed built-ins, custom
  permits, channel/role/user assignments, schedules, conditions, security
  whitelist scopes, and an optional manager-bypass enforcement mode.
- **Security** — anti-nuke, heat-based automod, join gate, verification (emoji
  or web), panic mode, backups, auto-recovery, and betrayal monitoring.
- **Community** — leveling, economy, stats, quote images, temp voice, AFK, and nick tools.
- **Custom commands** — guild-only Mustache-style commands with triggers, KV
  storage, cron/interval schedules, and Components V2 responses.
- **Tickets** — private-thread tickets with categories, staff roles, claims,
  priorities, tags, auto-tag replies, opening policy sessions, feedback, and
  permanent HTML transcripts.
- **Role tooling** — role menus (buttons, selects, reactions, temporary roles),
  autorole, voice roles, and resumable bulk role jobs.
- **Reminders** — durable DM-first reminders with snooze, recurring schedules,
  and retention cleanup.
- **Stats** — message/voice/member/status/boost tracking with image cards and a
  90-day raw-data retention cap.
- **Web dashboard** — Discord OAuth guild configuration, permits, audit/cases,
  security, stats, feature configs, addons, and web verification.

## Documentation

- [SETUP.md](SETUP.md)
- [AGENTS.md](AGENTS.md) and the `agents/` directory for agent-facing documentation.
- [agents/00-index.md](agents/00-index.md) indexes every subsystem doc.

## Self-hosting

The bot ships as a container image at `ghcr.io/lumi-devs/lumi`. Compose runs
Postgres, Redis, a one-shot migration service, and the bot.

```sh
cp .env.example .env
# fill BOT_TOKEN, OWNER_IDS, POSTGRES_PASSWORD, REDIS_PASSWORD, RPC_INTERNAL_TOKEN
docker compose pull
docker compose --profile migrate run --rm migrate
docker compose up -d
```

Pin `LUMI_TAG` to a release tag in production. See [SETUP.md](SETUP.md) for
source installs, Nix, and platform-specific instructions.

### Releases and upgrades

- Pushes to `v2/develop` publish branch and commit tags; they never move
  `latest`.
- Publishing a stable GitHub release (`vX.Y.Z`) publishes `X.Y.Z`, `X.Y` and
  `latest`, with SBOM and build provenance. Pre-releases never receive `latest`.
- Production pins `LUMI_TAG=vX.Y.Z`, pulls the image, runs the one-shot
  `migrate` service, then recreates the bot.
- Migrations are forward-only. Roll back to an older image tag only when the
  schema is compatible; otherwise restore the database backup first.
- The dashboard deploys separately from source (`apps/dashboard`, Node adapter)
  and should use the same release tag as the bot.

## Development

```sh
nix develop --command bun install
nix develop --command bun run setup   # create .env, check deps, migrate
nix develop --command bun run typecheck
nix develop --command bun run dashboard:typecheck
nix develop --command bun run test
nix develop --command bun run build
nix develop --command bun run dashboard:build
```
