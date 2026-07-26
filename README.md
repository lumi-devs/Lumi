<div align="center">
  <br />
  <img src="assets/banner.png" alt="Lumi" width="800">
  <br /><br />

  <p>
    <a href="https://github.com/lumi-devs/lumi/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/lumi-devs/lumi/ci.yml?branch=main&style=flat-square&label=CI&logo=github" alt="CI"></a>
    <a href="https://github.com/lumi-devs/lumi/actions/workflows/security.yml"><img src="https://img.shields.io/github/actions/workflow/status/lumi-devs/lumi/security.yml?branch=main&style=flat-square&label=Security&logo=github" alt="Security"></a>
    <a href="https://github.com/lumi-devs/lumi/actions/workflows/resilience.yml"><img src="https://img.shields.io/github/actions/workflow/status/lumi-devs/lumi/resilience.yml?branch=main&style=flat-square&label=Resilience&logo=github" alt="Resilience"></a>
    <a href="https://bun.sh"><img src="https://img.shields.io/badge/Bun-1.3+-black?style=flat-square&logo=bun" alt="Bun"></a>
    <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript"></a>
    <a href="https://sapphirejs.dev"><img src="https://img.shields.io/badge/Sapphire-Framework-blue?style=flat-square&logo=discord" alt="Sapphire Framework"></a>
    <a href="https://crowdin.com/project/lumi-bot"><img src="https://d322cqt584bo4o.cloudfront.net/lumi-bot/localized.svg" alt="Crowdin"></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/License-AGPL%20v3-green?style=flat-square" alt="AGPL v3"></a>
  </p>

  <p>
    <a href="#overview">Overview</a> •
    <a href="#self-hosting">Self-Hosting</a> •
    <a href="#architecture">Architecture</a> •
    <a href="#translations">Translations</a> •
    <a href="docs/">Docs</a> •
    <a href="#contributing">Contributing</a>
  </p>
</div>

---

## Overview

Lumi is a self-hosted, modular Discord bot built for communities that demand full control and high performance. Every feature is a hot-swappable module — toggle, configure, and extend without restarting the bot or touching core code.

Built with **Bun**, **TypeScript**, **Discord.js v14**, and the **Sapphire Framework**. Backed by **PostgreSQL 17** and **Redis 7**.

---

## Self-Hosting

> **Prerequisites:** Bun 1.3+, Docker & Docker Compose, PostgreSQL 17, Redis 7

```sh
git clone https://github.com/lumi-devs/lumi.git && cd lumi
cp .env.example .env   # Configure BOT_TOKEN and CLIENT_ID
make setup             # Install dependencies, boot container services, run migrations
make dev               # Start bot in monolith mode
```

Run `make help` for a complete list of available commands.

<details>
<summary><strong>Production Deployment (Docker)</strong></summary>

```sh
cp .env.example .env
# Edit .env — set BOT_TOKEN, CLIENT_ID, DATABASE_URL, REDIS_URL, NODE_ENV=production

# Boot core production services (Monolith Bot + Postgres + Redis)
docker compose --profile default up -d

# Optional: Boot with Web Dashboard included
docker compose --profile dashboard up -d
```

For scaled-out / distributed deployments (`gateway` + `worker` + `scheduler`), specify `LUMI_ROLE` per container node. Refer to [docs/architecture.md](docs/architecture.md).

</details>

<details>
<summary><strong>Development Setup & Nix Environment</strong></summary>

For local development with hot-reloading, type checking, and isolated tooling:

```sh
# Enter the multi-platform Nix dev shell (pre-packaged Bun, Node, GH CLI, Turbo, Prisma)
nix develop

# Or using legacy nix-shell
nix-shell

# Install dependencies and generate database clients
bun install
bun run db:generate

# Launch hot-reloading development server
make dev
```

Check out [CONTRIBUTING.md](CONTRIBUTING.md) for contribution rules, code conventions, and module development.

</details>

---

## Architecture

Lumi scales seamlessly from a single process to a distributed cluster using `LUMI_ROLE`:

| Role | Purpose |
|---|---|
| `monolith` | Default single-process mode. Runs gateway, workers, and scheduler together. |
| `gateway` | High-performance Discord WebSocket gateway receiver. |
| `worker` | Event processing worker pool for slash commands, triggers, and listeners. |
| `scheduler` | Queue processor for scheduled tasks and recurring cron jobs. |

Inter-process event streaming and RPC bridging operate on **Redis Streams**. Detailed specifications are in [docs/architecture.md](docs/architecture.md).

---

## Translations <a href="https://crowdin.com/project/lumi-bot" target="_blank"><img src="https://support.crowdin.com/assets/logos/crowdin-core-logo.png" align="right" width="20%"></a>

Lumi utilizes **Crowdin** to manage localization across multiple languages. All localized strings are managed centrally in `packages/core/src/languages/en-US/`. 

To help translate Lumi into your native language or refine existing translations, join our project on [**Crowdin**](https://crowdin.com/project/lumi-bot).

---

## Contributing

We welcome community contributions! Please read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting pull requests.

- Verify your changes pass checks: `bun run typecheck && bun run lint && bun run test`
- Maintain isolated, modular scope (one feature/fix per PR)
- Refer to [AGENTS.md](AGENTS.md) for architectural guidelines and design principles

---

## Security

Security vulnerabilities should be reported responsibly. Review [SECURITY.md](SECURITY.md) or use [GitHub's Private Vulnerability Reporting](https://github.com/lumi-devs/lumi/security/advisories/new).

---

## License

Distributed under the [AGPL v3 License](LICENSE). Publicly hosted derivatives must publish modified source code.
