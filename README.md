<div align="center">
  <img src="assets/banner.png" alt="Lumi" width="800">

  <h3>Modular, self-hosted Discord bot platform for communities that want full control.</h3>

  <p>
    <a href="https://github.com/lumi-devs/Lumi/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/lumi-devs/Lumi/ci.yml?branch=main&style=flat-square&label=CI&logo=github" alt="CI"></a>
    <a href="https://github.com/lumi-devs/Lumi/actions/workflows/security.yml"><img src="https://img.shields.io/github/actions/workflow/status/lumi-devs/Lumi/security.yml?branch=main&style=flat-square&label=Security&logo=github" alt="Security"></a>
    <a href="https://codecov.io/gh/lumi-devs/Lumi"><img src="https://codecov.io/gh/lumi-devs/Lumi/branch/main/graph/badge.svg" alt="Coverage"></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/License-GPL%20v3-A42E2B?style=flat-square&logo=gnu&logoColor=white" alt="GPL v3"></a>
    <a href="https://lumi-devs.github.io/Lumi-docs/"><img src="https://img.shields.io/badge/docs-lumi--devs.github.io-4C6EF5?style=flat-square&logo=gitbook&logoColor=white" alt="Documentation"></a>
  </p>

  <p>
    <a href="https://bun.sh"><img src="https://img.shields.io/badge/Bun-1.4%2B-000000?style=flat-square&logo=bun&logoColor=white" alt="Bun"></a>
    <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-6.x-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript"></a>
    <a href="https://www.postgresql.org"><img src="https://img.shields.io/badge/PostgreSQL-16%2B-4169E1?style=flat-square&logo=postgresql&logoColor=white" alt="PostgreSQL"></a>
    <a href="https://valkey.io"><img src="https://img.shields.io/badge/Valkey-7%2B-blue?style=flat-square&logo=valkey&logoColor=white" alt="Valkey"></a>
    <a href="https://discord.js.org"><img src="https://img.shields.io/badge/discord.js-v14-5865F2?style=flat-square&logo=discord&logoColor=white" alt="discord.js"></a>
  </p>
</div>

---

Lumi is a modular Discord bot built with Bun, TypeScript, Prisma, and Valkey. It runs as a single process: one Discord gateway client, an embedded RPC bridge for the dashboard, and in-process BullMQ scheduling.

Documentation site: **[https://lumi-devs.github.io/Lumi-docs](https://lumi-devs.github.io/Lumi-docs)** (source repo: [lumi-devs/Lumi-docs](https://github.com/lumi-devs/Lumi-docs)).

---

## Architecture

Lumi is a single-package monolith under `src/`:

| Path | Purpose |
| :--- | :--- |
| `src/Index.ts` | The one boot: database → modules → slash registration → RPC → gateway login → scheduling. |
| `src/modules/*` | Self-contained feature modules (commands, listeners, interactions, tasks, services, data). |
| `src/lib/*` | Shared framework: database, cache, permits, scheduler, RPC, UI kit, utilities. |
| `src/cli` | Command-line tool (`lumi`) for operations, migrations, and addon scaffolding. |
| `src/contracts` | Typed RPC router and schemas for the dashboard bridge. |
| `data/addons` | Third-party addon root. Addons load in-process through the same module loader. |

Import aliases: `#lib/*` maps to `src/lib/*`, `#src/*` maps to `src/*`.

---

## Features

- **Single Process**: Gateway, RPC, and scheduling run in one Bun process.
- **Red-Style Modules**: Self-contained modules plus third-party addons, loaded by one in-process loader with dependency sorting and per-guild toggles.
- **Granular Permissions**: Hierarchical, node-based permission system (`mod.*`, `admin.*`) checked before command execution, reorderable from the dashboard, RPC, and the hub panel.
- **Leveling**: Message and voice XP with 7 selectable level formulas, image rank cards, and Overall / Voice / Weekly / Monthly image leaderboards.
- **Guild Economy**: Wallet + bank balances with payday, taxed transfers, slots, and a fully audited transaction ledger.
- **Observability Built-in**: OpenTelemetry tracing and Prometheus metrics.
- **Robust Storage**: PostgreSQL with Prisma ORM for structured state; Valkey for caching, locks, and queues.

---

## Quickstart

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) with the compose plugin
- Discord Bot Application & Bot Token ([developer portal](https://discord.com/developers/applications))
  — enable the Server Members, Message Content, and Presence intents under Bot

### Setup

No clone, no build. Two commands:

1. **Answer a few questions** (writes `.env` + `compose.yml` into `./lumi`):
   ```bash
   mkdir lumi && cd lumi
   docker run --rm -it -v .:/setup ghcr.io/lumi-devs/lumi:latest lumi-setup init /setup
   ```

2. **Start everything** (pulls Postgres, Valkey, and the bot; migrations run automatically):
   ```bash
   docker compose up -d
   docker logs -f lumi-bot
   ```

Then invite the bot via the URL printed in the boot banner (OAuth2 `bot` + `applications.commands`
scopes) and run `/about` in your server. Updating is `docker compose pull && docker compose up -d`.

Contributors start at [Development](#development) below — that path uses a repo checkout.

---

## Development

```bash
# Typecheck
bun run typecheck

# Run linter
bun run lint
bun run lint:fix

# Run unit test suite (each file runs in its own process for isolation)
bun run test
```

---

## Addons & CLI

Lumi includes a command-line tool `lumi` (`src/cli`):

```bash
# Scaffold a new addon module
bun src/cli/Main.ts addon create my-addon

# Validate an addon
bun src/cli/Main.ts addon validate my-addon
```

Addons consume the bot through `createModuleApi()` (`src/lib/ModuleApi.ts`),
which hands out a guild-scoped surface: config, `bank` (balances, transfers,
pay-to-run, leaderboards), `levels` (XP, levels, boards), permits, UI cards,
KV, files, flags, scheduling, and antispam. See `docs/framework_bank.md` and
`docs/framework_leveling.md`.

---

## Inspiration

Lumi's module system takes inspiration from [Red-DiscordBot](https://github.com/Cog-Creators/Red-DiscordBot).

## License

Lumi is licensed under the [GNU Affero General Public License v3.0 (AGPL-3.0)](LICENSE).
