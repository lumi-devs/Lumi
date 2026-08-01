<div align="center">
  <img src="assets/banner.png" alt="Lumi" width="800">

  <p><strong>Fully modular, hot-swappable, self-hosted - built for communities that want control.</strong></p>

  <p>
    <a href="https://github.com/lumi-devs/lumi/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/lumi-devs/lumi/ci.yml?branch=main&style=flat-square&label=CI&logo=github" alt="CI"></a>
    <a href="https://github.com/lumi-devs/lumi/actions/workflows/security.yml"><img src="https://img.shields.io/github/actions/workflow/status/lumi-devs/lumi/security.yml?branch=main&style=flat-square&label=Security&logo=github" alt="Security"></a>
    <a href="https://github.com/lumi-devs/lumi/actions/workflows/resilience.yml"><img src="https://img.shields.io/github/actions/workflow/status/lumi-devs/lumi/resilience.yml?branch=main&style=flat-square&label=Resilience&logo=github" alt="Resilience"></a>
    <a href="https://codecov.io/gh/lumi-devs/lumi"><img src="https://codecov.io/gh/lumi-devs/lumi/branch/main/graph/badge.svg" alt="Coverage"></a>
  </p>

  <p>
    <a href="https://bun.sh"><img src="https://img.shields.io/badge/Bun-1.3%2B-000000?style=flat-square&logo=bun&logoColor=white" alt="Bun"></a>
    <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript"></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/License-AGPL%20v3-A42E2B?style=flat-square&logo=gnu&logoColor=white" alt="AGPL v3"></a>
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

> ⚠️ **Pre-Alpha Notice:** Lumi is currently in **pre-alpha**. Several components  including but not limited to the dashboard, Lumi Downloader, and various commands - are undocumented and subject to radical changes without notice. Expect breaking changes between updates.

Lumi is a self-hosted, modular Discord bot built for communities that demand full control and high performance. Every feature is a hot-swappable module - toggle, configure, and extend without restarting the bot or touching core code.

Built with **Bun**, **TypeScript**, **discord.js v14**, and the **[Sapphire Framework](https://sapphirejs.dev)**. Backed by **PostgreSQL 17** and **Redis 7**.

---

## Self-Hosting

### Requirements

- [**Bun**](https://bun.sh) 1.3+ - runtime and package manager
- [**Docker**](https://docs.docker.com/get-docker/) & [**Docker Compose**](https://docs.docker.com/compose/install/) - for containerized services
- [**PostgreSQL**](https://www.postgresql.org/download/) 17 - primary datastore
- [**Redis**](https://redis.io/download/) 7 - caching, queues, and cross-process event streaming

### Quick Start

```sh
git clone https://github.com/lumi-devs/lumi.git && cd lumi
cp .env.example .env
bun install
docker compose up -d postgres pgbouncer redis rabbitmq
bun run db:push
bun run dev
```

<details>
<summary><strong>Production Deployment (Docker & Local Build)</strong></summary>

```sh
cp .env.example .env

# Option A: Pull latest pre-built container image from GHCR
docker pull ghcr.io/lumi-devs/lumi:latest
docker compose up -d

# Option B: Build local container image
docker compose build
docker compose up -d

# Optional: Include Web Dashboard
docker compose --profile dashboard up -d
```

For scaled-out deployments (multiple `worker` replicas + a `scheduler`), specify `LUMI_ROLE` per container node and set `CLUSTER_NAME` so replicas divide the shard range between themselves. Refer to [docs/architecture.md](docs/architecture.md).

</details>

<details>
<summary><strong>Updating Lumi</strong></summary>

- **Bare-metal/Local**: Use the `/lumi update` command inside Discord to securely pull new code and gracefully restart your bot.
- **Docker Deployments**: Pull the latest image and restart the containers:
  ```sh
  docker pull ghcr.io/lumi-devs/lumi:latest
  docker compose up -d
  ```
  *(Tip: We recommend installing [Watchtower](https://containrrr.dev/watchtower/) to automate Docker updates!)*

</details>

<details>
<summary><strong>Development Setup & Nix Environment</strong></summary>

```sh
nix develop

bun install
bun run db:generate
bun run dev
```

Check out [CONTRIBUTING.md](CONTRIBUTING.md) for contribution rules, code conventions, and module development.

</details>

---

## Architecture

Lumi runs as two process roles, selected with `LUMI_ROLE`:

| Role | Purpose |
|---|---|
| `worker` | Default. Holds Lumi's Discord Gateway WebSocket connection and runs all slash commands, listeners, and module logic in the same process. |
| `scheduler` | Queue processor for scheduled tasks and recurring cron jobs. No WebSocket connection. |

Gateway ingestion and bot logic intentionally live in one process. Scaling is horizontal: set `CLUSTER_NAME` and `@lumi/sharding` assigns each worker replica a disjoint range of Discord shards, coordinating IDENTIFY throttling and resumable sessions through Redis. Multi-replica deployments route REST traffic through a shared `nirn-proxy` (`DISCORD_PROXY_URL`) so rate-limit buckets stay coordinated.

Task queueing runs on **Redis Streams**/BullMQ; RPC bridging between processes runs on **RabbitMQ**. Detailed specifications are in [docs/architecture.md](docs/architecture.md).

---

## Translations

Lumi utilizes **Crowdin** to manage localization across multiple languages. All localized strings are managed centrally in `packages/core/src/languages/en-US/`.

To help translate Lumi into your native language or refine existing translations, join our project on [**Crowdin**](https://crowdin.com/project/lumi-bot).

---

## Contributing

We welcome community contributions! Please read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting pull requests.

- Verify your changes pass checks: `bun run typecheck && bun run lint && bun run test`
- Maintain isolated, modular scope (one feature/fix per PR)
- Refer to [AGENTS.md](AGENTS.md) for architectural guidelines and design principles

Thank you to everyone who has contributed to Lumi:

<a href="https://github.com/lumi-devs/lumi/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=lumi-devs/lumi" alt="Lumi contributors">
</a>

## Security

Security vulnerabilities should be reported responsibly. Review [SECURITY.md](SECURITY.md) or use [GitHub's Private Vulnerability Reporting](https://github.com/lumi-devs/lumi/security/advisories/new).

## License

Distributed under the [AGPL v3 License](LICENSE). Publicly hosted derivatives must publish modified source code.
