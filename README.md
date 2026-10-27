<div align="center">
  <img src="assets/banner.png" alt="Lumi" width="800">

  <h3>Modular, self-hosted Discord bot platform for communities that want full control.</h3>

  <p>
    <a href="https://github.com/lumi-devs/Lumi/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/lumi-devs/Lumi/ci.yml?branch=v2%2Fdevelop&style=flat-square&label=CI&logo=github" alt="CI"></a>
    <a href="https://github.com/lumi-devs/Lumi/actions/workflows/security.yml"><img src="https://img.shields.io/github/actions/workflow/status/lumi-devs/Lumi/security.yml?branch=v2%2Fdevelop&style=flat-square&label=Security&logo=github" alt="Security"></a>
    <a href="https://codecov.io/gh/lumi-devs/Lumi"><img src="https://codecov.io/gh/lumi-devs/Lumi/branch/v2%2Fdevelop/graph/badge.svg" alt="Coverage"></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/License-AGPL%20v3-A42E2B?style=flat-square&logo=gnu&logoColor=white" alt="AGPL v3"></a>
    <a href="https://lumi-devs.github.io/Lumi-docs/"><img src="https://img.shields.io/badge/docs-lumi--devs.github.io-4C6EF5?style=flat-square&logo=gitbook&logoColor=white" alt="Documentation"></a>
  </p>

  <p>
    <a href="https://bun.sh"><img src="https://img.shields.io/badge/Bun-1.4%2B-000000?style=flat-square&logo=bun&logoColor=white" alt="Bun"></a>
    <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-6.x-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript"></a>
    <a href="https://www.postgresql.org"><img src="https://img.shields.io/badge/PostgreSQL-18%2B-4169E1?style=flat-square&logo=postgresql&logoColor=white" alt="PostgreSQL"></a>
    <a href="https://redis.io"><img src="https://img.shields.io/badge/Redis-8%2B-blue?style=flat-square&logo=redis&logoColor=white" alt="Redis"></a>
    <a href="https://discord.js.org"><img src="https://img.shields.io/badge/discord.js-v14-5865F2?style=flat-square&logo=discord&logoColor=white" alt="discord.js"></a>
    <a href="https://nixos.org"><img src="https://img.shields.io/badge/Nix-Flakes-5277C3?style=flat-square&logo=nixos&logoColor=white" alt="Nix"></a>
  </p>
</div>

---

Lumi is a modular Discord bot built with Bun, TypeScript, Prisma, and Redis. It runs as a single process: one Discord gateway client, an embedded RPC bridge, and in-process BullMQ scheduling.

**Documentation:** [lumi-devs.github.io/Lumi-docs](https://lumi-devs.github.io/Lumi-docs) · **Default branch:** `v2/develop`

---

## Architecture

Lumi is a Bun-workspace monorepo. The product's centrepiece is the **module loader and addon downloader**; caching and database access exist to keep that hot path fast and correct.

| Path | Purpose |
| :--- | :--- |
| `src/` | Built-in services (always on): gateway, sharding, RPC, scheduler, lifecycle, admin panel, permits |
| `modules/` | Toggleable supermodules (community, moderation, logging, security, utility) |
| `packages/` | Shared libraries (`module-kit`, `module-runtime`, `permits`, `db`, `redis`, `ui`, `observability`, `cache`, `scheduler`, `downloader`) |
| `agents/` | Agent operating specs for AI-assisted development |
| `config/` | Prisma schema and migrations |

**Non-negotiables:**
- Every module is toggleable. No privileged "core" module and no `essential`/`disableable` escape hatch.
- Modules are discovered from `manifest.json` and loaded from an explicit entry file. No hidden global registries.
- Built-in commands have `module: null` and always run. Module commands only run when that module is enabled for the guild.
- Addons are untrusted. Install with validation, path checks, and atomic switches.
- Database is Postgres via Prisma with versioned migrations.
- Redis is a single endpoint. No Cluster/Sentinel code paths.
- UI is the card system in `@lumi/ui`. **Never use Discord embeds.** All user-facing output is a Components V2 card.

---

## Features

### 🏗️ Supermodules
Every module is a supermodule with independently-toggleable submodules. Expand/collapse in `/lumi` → Modules. Enable/disable per guild — other guilds keep the module.

### 🔐 Permit-based Access
Hierarchical Grant/Deny system with per-server numbering. Built-in permits (Extra Owner, Trusted Admin) locked from reordering.

### 🎴 Components V2 Only
All user output uses Components V2 cards via `@lumi/ui` — no embeds, no ad-hoc payloads.

### 📈 Leveling
Message and voice XP with 7 selectable formulas (Disgaea, Fibonacci, Linear, MEE6, Atlas, Arcane, Lurkr), image rank cards, role rewards, announcements, and Overall/Voice leaderboards.

### 💰 Economy
Wallet + bank balances with payday, taxed transfers, slots, and audited transaction ledger.

### 🛡️ Moderation & Security
- **Anti-nuke:** Sliding-window detection with quarantine/ban responses
- **Join gate:** Filters for no-avatar, min age, unverified bots, advertising, raid detection
- **Verification:** Emoji captcha, pending/verified roles, timeout sweep
- **Panic mode:** Channel lockdown, invite disabling, permission snapshots, revert
- **Backups:** Periodic structure snapshots with auto-recovery
- **Automod:** Heat-based filtering with 13 filters and escalating punishments

### 📊 Observability Built-in
OpenTelemetry tracing and Prometheus metrics on port 9090.

---

## Quickstart

### Prerequisites

- [Nix](https://nixos.org/download) (with flakes enabled) — or Docker
- PostgreSQL 18+ (included in Nix shell / Docker compose)
- Redis 8+ (included in Nix shell / Docker compose)
- Discord Bot Application & Bot Token ([developer portal](https://discord.com/developers/applications))
  — enable **Server Members**, **Message Content**, and **Presence** intents under Bot

### Option A: Docker (Recommended)

```bash
# 1. Generate .env + compose.yml into ./lumi
mkdir lumi && cd lumi
docker run --rm -it -v .:/setup ghcr.io/lumi-devs/lumi:latest lumi-setup init /setup

# 2. Start everything (Postgres, Redis, bot; migrations run automatically)
docker compose up -d
docker logs -f lumi-bot
```

Invite the bot via the URL printed in the boot banner (OAuth2 `bot` + `applications.commands` scopes), then run `/about` in your server. Updating: `docker compose pull && docker compose up -d`.

### Option B: Local Development (Nix)

```bash
git clone git@github.com:lumi-devs/Lumi.git
cd Lumi
nix develop          # enters dev shell with Bun, Node, Postgres, Redis, canvas deps
cp .env.example .env # fill in DISCORD_TOKEN, OWNER_IDS, DATABASE_URL, REDIS_URL
bunx prisma migrate deploy
bunx prisma generate

bun run typecheck    # tsc --noEmit
bun run test         # vitest
bun run dev:bot      # or: docker compose up -d
```

---

## Configuration via `/lumi`

Run `/lumi` in your server to open the module management panel. From there you can:

- Enable/disable **supermodules** and **submodules** per guild
- Configure module settings (voice XP, anti-nuke thresholds, join gate filters, etc.)
- Manage **permits** (Extra Owner, Trusted Admin, custom permits)
- Track add-on git repositories and install modules (bot owners only)

All settings are category-grouped, not "Settings 1/2". Module disable removes that guild's slash commands and stops its listeners while other guilds keep the module.

---

## Commands

| Command | Description |
|---------|-------------|
| `/lumi` | Open the module management panel |
| `/permit` | Manage permits and nodes |
| `/rank` | Check your or another user's level (image card) |
| `/leaderboard` | View XP or voice leaderboard (paginated) |
| `/panic` / `/panic revert` | Enter/exit panic mode (Security) |
| `/ping` | Bot latency & gateway heartbeat |
| `/about` | Bot info & status |

Prefix commands also work: `,` (default), custom guild prefix, or bot mention.

---

## Module Development

Each supermodule lives in `modules/<name>/`; its submodules are sibling directories, each with its own manifest and entry:

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

**Manifest contract:**
```json
{
  "apiVersion": 2,
  "name": "community-leveling",
  "displayName": "Leveling",
  "emoji": "📈",
  "description": "XP, levels, role rewards, and leaderboards with voice XP support",
  "version": "2.1.0",
  "entry": "index.ts",
  "configKey": "leveling",
  "configFields": [
    { "key": "xpPerMessage", "label": "XP per Message", "type": "number", "category": "XP & Cooldown" }
  ],
  "dependencies": { "community": "^2.0.0" }
}
```

See `agents/module-dev-guide.md` for the full spec.

---

## Testing

```bash
bun run typecheck   # tsc --noEmit
bun run lint        # biome
bun run test        # vitest (141+ tests)
bun run build       # bun build src/index.ts --target=bun --external canvas --outdir=dist
```

---

## License

GNU Affero General Public License v3.0 (AGPL-3.0)

See `LICENSE` for details.

---

## Inspiration

Lumi's module system draws inspiration from [Red-DiscordBot](https://github.com/Cog-Creators/Red-DiscordBot)'s cog-based modularity.