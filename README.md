# Lumi v2

A Discord bot focused on moderation, community tooling, security, and server
insights, written in TypeScript and running on Bun.

## Features

- **Moderation** — bans, kicks, timeouts, warnings, notes, cases, channel locks,
  quarantine, purge, and voice moderation.
- **Permits** — Wick-style numbered permits with fixed built-ins, custom
  permits, channel/role/user assignments, schedules, conditions, security
  whitelist scopes, and an optional manager-bypass enforcement mode.
- **Security** — anti-nuke, heat-based automod, join gate, verification (emoji
  or web), panic mode, backups, auto-recovery, and betrayal monitoring.
- **Community** — leveling, economy, temp voice, AFK, and nick tools.
- **Custom commands** — guild-only Mustache-style commands with triggers, KV
  storage, cron/interval schedules, and Components V2 responses.
- **Tickets** — private-thread tickets with categories, staff roles, claims,
  priorities, tags, feedback, and permanent HTML transcripts.
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

## Development

```sh
nix develop --command bun install
nix develop --command bun run typecheck
nix develop --command bun run dashboard:typecheck
nix develop --command bun run test
nix develop --command bun run build
nix develop --command bun run dashboard:build
```
