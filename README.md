<div align="center">
  <br />
  <img src="assets/banner.png" alt="Lumi" width="800" style="border-radius: 12px;">
  <br />

  <h1>Lumi</h1>
  <p>Self-hosted Discord bot — modular, fast, and easy to run.</p>

  <a href="https://bun.sh"><img src="https://img.shields.io/badge/Bun-1.3+-black?style=flat-square&logo=bun" alt="Bun"></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript"></a>
  <a href="https://discord.js.org"><img src="https://img.shields.io/badge/Discord.js-v14-5865F2?style=flat-square&logo=discord&logoColor=white" alt="Discord.js"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-AGPL%20v3-green?style=flat-square" alt="AGPL v3"></a>
  <a href="https://github.com/lumi-devs/lumi/actions"><img src="https://img.shields.io/github/actions/workflow/status/lumi-devs/lumi/ci.yml?style=flat-square&label=CI" alt="CI"></a>
</div>

---

## What is Lumi?

Lumi is a Discord bot with a built-in web dashboard. You run it yourself on your own server. It comes with moderation, logging, auto-filter, temp voice channels, AFK tracking, and more — all toggleable per server without restarts.

It's built on [Bun](https://bun.sh), TypeScript, [Discord.js v14](https://discord.js.org), and [Sapphire](https://sapphirejs.dev). Backs onto PostgreSQL, Redis, and RabbitMQ.

## Quick Start

**Requirements:** Bun 1.3+, Docker

```bash
git clone https://github.com/lumi-devs/lumi.git && cd lumi
cp .env.example .env
# Edit .env — set BOT_TOKEN and CLIENT_ID at minimum
make setup   # installs deps, starts backing services, runs DB migrations
make dev     # start the bot with hot-reload
```

That's it. The bot is running.

## Running with Docker

```bash
# Default stack (bot + postgres + redis + rabbitmq)
docker compose --profile default up -d

# With the web dashboard on :8080
docker compose --profile default --profile dashboard up -d
```

## Built-in Modules

| Module | What it does |
| :--- | :--- |
| `core` | Module toggles, per-guild prefix, permission tiers |
| `mod` | Ban, kick, timeout, warn, quarantine with case history |
| `filter` | Auto-filter messages with regex/substring rules |
| `utility` | Server info, user lookup, avatar |
| `afk` | AFK status — notifies callers, clears on return |
| `tempvc` | Auto-creates/deletes temporary voice channels |
| `logging` | Audit log for messages, members, roles, mod actions |
| `dashboard` | RPC bridge for the web admin panel |

## Docs

- [Architecture & topology](docs/architecture.md)
- [Configuration reference](docs/configuration.md)
- [Modules & developer CLI](docs/modules.md)
- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)
- [AI agent guidelines](AGENTS.md)

## License

[AGPL v3](LICENSE) — if you run a modified version publicly, you must share the source.

The "Lumi" name, logo, and mascot are reserved. Forks must rebrand.
