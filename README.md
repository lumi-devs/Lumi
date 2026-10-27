<div align="center">
  <img src="assets/banner.png" alt="Lumi" width="800">

  <h3>Modular, self-hosted Discord bot for communities that want full control.</h3>

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

**Lumi** is a modular Discord bot built with **Bun**, **TypeScript**, **PostgreSQL**, and **Redis**. One process runs the gateway, an embedded RPC bridge, and a job scheduler. Everything loads as toggleable **supermodules** — no hardcoded core, no privileged modules.

> **Default branch:** `v2/develop` · **Docs:** [lumi-devs.github.io/Lumi-docs](https://lumi-devs.github.io/Lumi-docs)

---

## Why Lumi?

| Problem | Lumi's Answer |
|---------|---------------|
| "I only need moderation, not 50 cogs" | **Enable exactly what you need** — per guild, per submodule |
| "Config is a nightmare" | **Visual panel** (`/lumi`) with category-grouped settings, not "Settings 1/2" |
| "Perms are all-or-nothing" | **Grant/Deny hierarchy** with node-based permits, time-based expiry, built-in Extra Owner & Trusted Admin |
| "Embeds break on mobile" | **Components V2 only** — clean, accessible cards that render everywhere |
| "Voice XP is buggy" | **Audible-only tracking** — mute/deaf/server-mute = no XP, auto-resume on unmute |
| "I want to self-host without Docker" | **Nix flakes, systemd, Windows, bare metal** — [see SETUP.md](SETUP.md) |

---

## Features at a Glance

### 🏗️ Supermodules
Toggle entire feature families or individual submodules per server. Other servers keep their config.

| Supermodule | Submodules |
|-------------|------------|
| **Community** | Leveling (XP, ranks, rewards, voice), Economy (wallet, bank, slots, payday) |
| **Moderation** | Cases, bans, kicks, timeouts, quarantine, warns, modlog |
| **Logging** | Message/edit/delete, voice, mod actions, joins/leaves |
| **Security** | Anti-nuke, join gate, verification, panic mode, backups, automod, betrayal detection, autorecovery |
| **Utility** | AFK, temporary voice channels, avatar/banner/whois |

### 🔐 Permissions That Make Sense
- **Polarity**: Grant (allow) / Deny (block) — deny wins
- **Nodes**: `mod.ban`, `admin.config`, `economy.*`, `*` wildcards
- **Time-based**: "Trusted Admin for 30 days"
- **Conditions**: "Only in #mod-channel", "Only for roles X/Y"
- **Locked permits**: Extra Owner, Trusted Admin — can't be reordered or deleted

### 🎴 Beautiful Output
All responses use **Discord Components V2** — no embeds, no broken mobile layouts. Rank cards are generated server-side as PNGs with level, XP, rank, and progress bar.

### 📈 Leveling Done Right
- 7 formulas: Disgaea, Fibonacci, Linear, MEE6, Atlas, Arcane, Lurkr
- Role rewards at levels (with optional stacking)
- Voice XP: **only while audible** (mute/deaf = paused, auto-resume)
- Ignore/whitelist channels & roles — whitelist overrides ignore
- Image leaderboards (Overall + Voice) with pagination

### 🛡️ Security Suite
- **Anti-nuke**: Sliding-window action detection → quarantine/ban
- **Join gate**: No avatar, min age, unverified bots, invite links, raid detection
- **Verification**: Emoji captcha, pending/verified roles, timeout sweep
- **Panic mode**: Instant lockdown, disable invites, snapshot perms, one-click revert
- **Backups**: Periodic structure snapshots with auto-recovery
- **Automod**: 13 heat-based filters with escalating punishments

### 📊 Observability Built-In
- **Prometheus metrics** on `:9090/metrics` — gateway latency, DB latency, cache hit ratio, command counts, XP granted
- **OpenTelemetry tracing** — every command, listener, and RPC call
- **Health endpoint** on `:8091/health` — for load balancers / uptime monitors

---

## Get Started in 2 Minutes

### Docker (Production)
```bash
mkdir lumi && cd lumi
docker run --rm -it -v .:/setup ghcr.io/lumi-devs/lumi:latest lumi-setup init /setup
docker compose up -d
```
→ Bot runs, Postgres + Redis included, migrations auto-apply.

### Nix (Development)
```bash
git clone git@github.com:lumi-devs/Lumi.git
cd Lumi
nix develop           # Bun, Postgres, Redis, canvas deps all ready
cp .env.example .env  # Add your token
bunx prisma migrate deploy
bun run dev:bot
```

👉 **Full platform guide**: [SETUP.md](SETUP.md) — Docker, NixOS, Ubuntu, Debian, Arch, Windows, systemd, PM2, NSSM.

---

## Commands

| Command | What it does |
|---------|--------------|
| `/lumi` | Open the module management panel |
| `/permit` | Manage permits & nodes |
| `/rank` | Your level card (image) |
| `/leaderboard` | XP or voice leaderboard |
| `/panic` / `/panic revert` | Security lockdown |
| `/ping` | Latency & gateway heartbeat |
| `/about` | Bot info & status |

Prefix: `,` (default), custom guild prefix, or `@bot mention`.

---

## Architecture (TL;DR)

```
src/                    # Built-in (always on)
  core/                 # Gateway, sharding, RPC, scheduler
  admin/                # Module manager, /lumi panel, permits
modules/                # Toggleable supermodules
  community/            # leveling, economy
  moderation/           # mod
  logging/              # logs
  security/             # antinuke, join-gate, verification, panic, backups, automod, betrayal, autorecovery
  utility/              # afk, tempvc, info
packages/               # Shared libs
  module-kit            # defineModule() contracts
  module-runtime        # Discovery, loader, per-guild toggles
  permits               # Grant/Deny evaluation
  db                    # Prisma + repositories
  redis                 # Client, pub/sub, locks, invalidation
  ui                    # Components V2 cards
  observability         # Metrics, tracing, health
  scheduler             # Cron, distributed locks
  downloader            # Addon install/update
```

**Non-negotiables:**
- Every module is toggleable — no "core" escape hatch
- Modules discovered from `manifest.json` + explicit entry file
- Built-in commands (`module: null`) always run; module commands gate on `isActive(guild, module)`
- Addons are untrusted — validated, path-checked, atomically switched
- Postgres via Prisma (versioned migrations), Redis single endpoint
- **UI = `@lumi/ui` cards only** — never `EmbedBuilder`

---

## License

**AGPL-3.0** — see [LICENSE](LICENSE).

Free to use, modify, and self-host. If you expose Lumi as a network service, you must offer source.

---

## Inspiration

Lumi's module system draws inspiration from [Red-DiscordBot](https://github.com/Cog-Creators/Red-DiscordBot)'s cog-based modularity and YAGPDB's fleet architecture.

---

## Links

- 📖 **Documentation** → https://lumi-devs.github.io/Lumi-docs
- 🐛 **Issues** → https://github.com/lumi-devs/Lumi/issues
- 📦 **Setup Guide** → [SETUP.md](SETUP.md)