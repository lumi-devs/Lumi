# Lumi v2

Modular, self-hosted Discord bot framework built with **TypeScript** and **Bun**. Production-ready architecture with independently-toggleable supermodules.

## What is Lumi?

Lumi is a single-process Discord bot that runs one gateway client, an embedded RPC bridge, and an in-process Bun build manager. Everything loads as toggleable **supermodules** — no hardcoded core, no privileged modules.

## Architecture

```
src/                         # Built-in services (always on)
  core/                      # Gateway, sharding, RPC, scheduler, lifecycle
  admin/                     # Module manager, /lumi panel, owner commands
modules/                     # Toggleable supermodules
  community/                 → leveling, economy
  moderation/                → mod (cases, bans, kicks, timeouts, quarantine)
  logging/                   → logs (message, edit, delete, voice, mod)
  security/                  → antinuke, join-gate, verification, panic,
                               backups, betrayal, autorecovery, automod
  utility/                   → afk, tempvc, info (avatar, banner, whois)
packages/                    # Shared libraries
  module-kit                 # Module definition contracts
  module-runtime             # Supermodule discovery + loader
  permits                    # Grant/Deny permit system
  db                         # Prisma + repositories
  redis                      # Client, invalidation, locks
  ui                         # Components V2 card system
  observability              # Health, metrics
  cache                      # L1/L2 cache
  scheduler                  # Distributed cron
  downloader                 # Addon installer
```

## Key Features

- **Supermodules** — Every module is a supermodule with independently-toggleable submodules. Expand/collapse in `/lumi` → Modules.
- **Permit-based access** — Grant/Deny polarity, per-server numbering, built-in permits (Extra Owner, Trusted Admin) locked from reordering.
- **No embeds** — All user output uses Components V2 cards via `@lumi/ui`.
- **Voice XP** — Toggleable voice-minute XP tracking with 7 level formulas, role rewards, and announcements.
- **Anti-nuke** — Sliding-window detection with quarantine/ban responses.
- **Join gate** — Filters for no-avatar, min age, unverified bots, advertising, raid detection.
- **Verification** — Emoji captcha, pending/verified roles, timeout sweep.
- **Panic mode** — Channel lockdown, invite disabling, permission snapshots, revert.
- **Backups** — Periodic structure snapshots with auto-recovery.
- **Automod** — Heat-based filtering with 13 filters and escalating punishments.

## Quick Start

### Prerequisites

- [Nix](https://nixos.org/download) (with flakes enabled)
- PostgreSQL 18+
- Redis 8+
- A Discord bot application with a token

### 1. Clone & enter the dev shell

```bash
git clone git@github.com:lumi-devs/Lumi.git
cd Lumi
nix develop
```

### 2. Configure environment

Copy `.env.example` to `.env` and fill in your values:

```env
DISCORD_TOKEN=your_bot_token
OWNER_IDS=123456789012345678
DATABASE_URL="postgresql://lumi:lumi@localhost:5432/lumi"
REDIS_URL="redis://localhost:6379"
```

### 3. Set up the database

```bash
bunx prisma migrate deploy
bunx prisma generate
```

### 4. Build & start

```bash
bun run typecheck
bun test
bun run dev        # or: docker compose up -d
```

The bot will log in and you can invite it using the OAuth2 URL printed on startup.

### 5. Configure via `/lumi`

Run `/lumi` in your server to open the module management panel. From there you can:

- Enable/disable supermodules and submodules per guild
- Configure module settings (voice XP, anti-nuke thresholds, etc.)
- Manage permits (Extra Owner, Trusted Admin, custom permits)
- Install add-ons (bot owners and Extra Owners only)

## Commands

| Command | Description |
|---------|-------------|
| `/lumi` | Open the module management panel |
| `/permit` | Manage permits and nodes |
| `/levelset` | Configure leveling (XP, voice, formulas, rewards) |
| `/rank` | Check your or another user's level |
| `/leaderboard` | View XP or voice leaderboard |
| `/panic` / `/panic revert` | Enter/exit panic mode (Security) |

## Module Development

Each supermodule lives in `modules/<name>/`; its submodules are sibling
directories, each with its own manifest and entry:

```
modules/utility/
├── manifest.json          # supermodule: no submodule list, filesystem is truth
├── index.ts               # defineModule entry
├── afk/
│   ├── manifest.json
│   └── index.ts           # defineModule for utility-afk
└── tempvc/
    ├── manifest.json
    └── index.ts
```

## Testing

```bash
bun run typecheck   # tsc --noEmit
bun test            # vitest
```

## License

GNU Affero General Public License v3.0 (AGPL-3.0)

See `LICENSE` for details.

## Documentation

- [Architecture](agents/architecture.md)
- [Module Development](agents/module-dev-guide.md)
- [Addon Development](agents/addon-dev-guide.md)
- [Commands](agents/commands.md)
- [Permissions](agents/permissions.md)
- [Database](agents/db.md)
- [UI/Card System](agents/ui.md)

## Inspiration

Lumi's module system draws inspiration from [Red-DiscordBot](https://github.com/Cog-Creators/Red-DiscordBot)'s cog-based modularity.
