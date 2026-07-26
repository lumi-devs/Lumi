<div align="center">
  <br />
  <img src="assets/banner.png" alt="Lumi" width="800">
  <br /><br />

  <p>
    <a href="https://github.com/lumi-devs/lumi/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/lumi-devs/lumi/ci.yml?branch=main&style=flat-square&label=CI&logo=github" alt="CI"></a>
    <a href="https://bun.sh"><img src="https://img.shields.io/badge/Bun-1.3+-black?style=flat-square&logo=bun" alt="Bun"></a>
    <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript"></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/License-AGPL%20v3-green?style=flat-square" alt="AGPL v3"></a>
    <a href="https://discord.gg/lumi"><img src="https://img.shields.io/discord/1234567890?color=5865F2&label=Discord&logo=discord&logoColor=white&style=flat-square" alt="Discord"></a>
    <a href="https://crowdin.com/project/lumi"><img src="https://d322cqt584bo4o.cloudfront.net/lumi/localized.svg" alt="Localized with Crowdin"></a>
  </p>

  <p>
    <a href="#overview">Overview</a> •
    <a href="#self-hosting">Self-Hosting</a> •
    <a href="docs/">Docs</a> •
    <a href="#contributing">Contributing</a>
  </p>
</div>

---

## Overview

Lumi is a self-hosted, modular Discord bot built for communities that want full control. Every feature is a hot-swappable module — toggle, configure, and extend without restarting the bot or touching code.

Built on **Bun**, **TypeScript**, **Discord.js v14**, and the **Sapphire Framework**. Backed by PostgreSQL and Redis.

## Self-Hosting

> **Requirements:** Bun 1.3+, Docker, PostgreSQL 17, Redis 7

```sh
git clone https://github.com/lumi-devs/lumi.git && cd lumi
cp .env.example .env   # fill in BOT_TOKEN and CLIENT_ID at minimum
make setup             # install deps, start services, run migrations
make dev               # start bot in monolith mode
```

Check `make help` for all available commands.

<details>
<summary><strong>Production deployment (Docker)</strong></summary>

```sh
cp .env.example .env
# Edit .env — set BOT_TOKEN, CLIENT_ID, DATABASE_URL, REDIS_URL, NODE_ENV=production

# Start all services (bot + Postgres + Redis)
docker compose --profile default up -d

# Optional: include the web dashboard
docker compose --profile dashboard up -d
```

For distributed mode (gateway + worker + scheduler as separate processes), set `LUMI_ROLE` and `TRANSPORT=streams` per process. See [docs/architecture.md](docs/architecture.md) for details.

</details>

<details>
<summary><strong>Development setup</strong></summary>

For a full local dev environment with hot-reload and all tooling:

```sh
# Recommended: use the Nix flake dev shell (includes bun, node, gh, turbo, prisma)
nix develop

# Or with nix-shell
nix-shell

# Then run
bun install
bun run db:generate   # generate Prisma client
make dev              # start bot with hot-reload
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full development guide, coding standards, and module authoring rules.

</details>

## Architecture

Lumi supports four runtime roles via `LUMI_ROLE`:

| Role | Description |
|---|---|
| `monolith` | Default — all features in one process |
| `gateway` | Dedicated Discord WebSocket receiver |
| `worker` | Event consumer for commands and listeners |
| `scheduler` | BullMQ queue manager for scheduled tasks |

Event transport between processes uses Redis Streams (`TRANSPORT=streams`). See [docs/architecture.md](docs/architecture.md).

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

- Run `bun run typecheck && bun run lint && bun run test` before pushing
- One feature or fix per PR
- Follow the module system rules in [AGENTS.md](AGENTS.md)

## Security

To report a vulnerability, see [SECURITY.md](SECURITY.md) or use [GitHub's private vulnerability reporting](https://github.com/lumi-devs/lumi/security/advisories/new).

## License

[AGPL v3](LICENSE) — if you run a publicly modified version, you must share the source.

The **Lumi** name, logo, and mascot are reserved. Forks must rebrand.
