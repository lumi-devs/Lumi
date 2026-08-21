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
    <a href="LICENSE"><img src="https://img.shields.io/badge/License-GPL%20v3-A42E2B?style=flat-square&logo=gnu&logoColor=white" alt="GPL v3"></a>
  </p>

  <p>
    <a href="#overview">Overview</a> •
    <a href="#self-hosting">Self-Hosting</a> •
    <a href="#architecture">Architecture</a> •
    <a href="#translations">Translations</a> •
    <a href="docs/">Docs</a> •
    <a href="https://lumi-devs.github.io/Lumi/">Docs Site</a> •
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

- [**Bun**](https://bun.sh) 1.3+ - runtime and package manager (always required, Docker or not)
- A **Discord application** - bot token + client ID from the [Developer Portal](https://discord.com/developers/applications)
- **PostgreSQL 17** and **Redis 7** - either via [Docker](https://docs.docker.com/get-docker/) or installed natively

### Quick Start (with Docker)

The easiest path - Docker runs Postgres and Redis for you; only Bun and the app itself run on the host.

```sh
git clone https://github.com/lumi-devs/lumi.git && cd lumi
bun install
bun run setup   # interactive wizard: builds .env, verifies your bot token, offers to start the services below
```

Prefer to do it by hand instead of the wizard:

```sh
cp .env.example .env
$EDITOR .env                                       # fill in BOT_TOKEN, CLIENT_ID at minimum
docker compose up -d postgres pgbouncer redis
bun run db:migrate
bun run dev
```

### Quick Start (without Docker)

Lumi itself is just a Bun process reading connection strings from `.env` - nothing in the code requires Docker. Two ways to skip it:

**A. Nix dev shell** - provisions native Postgres/Redis binaries alongside Bun:

```sh
git clone https://github.com/lumi-devs/lumi.git && cd lumi
nix develop   # or: nix-shell
cp .env.example .env && $EDITOR .env
bun install
bun run db:generate
bun run db:migrate
bun run dev
```

**B. Bring your own services** - install Postgres 17 and Redis 7 yourself, however you normally would (system package manager, existing servers, etc.), then point `.env` at them:

```sh
git clone https://github.com/lumi-devs/lumi.git && cd lumi
cp .env.example .env
$EDITOR .env   # set POSTGRES_URL / REDIS_HOST to your own instances
bun install
bun run db:generate
bun run db:migrate
bun run dev
```

See [Configuration Reference](docs/configuration.md) for every `.env` variable.

<details>
<summary><strong>Production Deployment</strong></summary>

```sh
cp .env.example .env

# Option A: Pull the latest pre-built image from GHCR
docker pull ghcr.io/lumi-devs/lumi:latest
docker compose up -d

# Option B: Build the image locally
docker compose build
docker compose up -d
```

> [!WARNING]
> The `dashboard` Compose profile does not work yet - the shared `Dockerfile` has no `next build` stage, so `next start` exits with *"Could not find a production build in the '.next' directory"*. Run the dashboard directly (`bun run --cwd apps/dashboard build && bun run --cwd apps/dashboard start`) until that image stage lands. See [docs/dashboard.md](docs/dashboard.md#running-it).

For scaled-out deployments (multiple `worker` replicas), set `CLUSTER_NAME` and give each replica a disjoint `SHARD_LIST` so they divide the shard range between themselves. Full walkthrough: [docs/GUIDE_PRODUCTION_DEPLOYMENT.md](docs/GUIDE_PRODUCTION_DEPLOYMENT.md).

</details>

<details>
<summary><strong>Updating Lumi</strong></summary>

- **Without Docker**: `git pull && bun install && bun run db:migrate`, then restart the process (or `/lumi update` from inside Discord to do it in-place).
- **With Docker**:
  ```sh
  docker pull ghcr.io/lumi-devs/lumi:latest
  docker compose up -d
  ```
  *(Tip: [Watchtower](https://containrrr.dev/watchtower/) automates this.)*

</details>

Full step-by-step guide, including the optional dashboard and observability stack: [docs/GUIDE_SELF_HOSTING.md](docs/GUIDE_SELF_HOSTING.md).

---

## Architecture

Every worker process is identical - there's no separate scheduler role. `apps/worker/src/main.ts` is a lightweight discord.js `ShardingManager` that spawns one child process per shard it owns; each child holds a real Discord Gateway WebSocket connection and runs all slash commands, listeners, and module logic in the same process.

Gateway ingestion and bot logic intentionally live in one process. Scaling is horizontal: set `CLUSTER_NAME` and give each replica a disjoint `SHARD_LIST`. Exactly one shard per pod - the one holding shard id `0` - is elected "primary" with zero coordination and owns BullMQ job scheduling and the RPC/metrics HTTP surface. Multi-replica deployments route REST traffic through a shared `nirn-proxy` (`DISCORD_PROXY_URL`) so rate-limit buckets stay coordinated.

Task queueing runs on **Redis Streams**/BullMQ; the dashboard talks to the worker over an **internal HTTP RPC bridge**. Detailed specifications are in [docs/architecture.md](docs/architecture.md).

---

## Translations

Lumi utilizes **Crowdin** to manage localization across multiple languages. All localized strings are managed centrally in `packages/core/src/languages/en-US/`.

To help translate Lumi into your native language or refine existing translations, join our project on [**Crowdin**](https://crowdin.com/project/lumi-bot).

---

## Contributing

We welcome community contributions! Please read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting pull requests.

- Verify your changes pass checks: `bun run typecheck && bun run lint && bun run test`
- Run `bun run test:coverage` to generate coverage reports (`coverage/lcov.info` and `coverage/dashboard/lcov.info`), matching what CI uploads to Codecov
- Maintain isolated, modular scope (one feature/fix per PR)
- Refer to [AGENTS.md](AGENTS.md) for architectural guidelines and design principles

Thank you to everyone who has contributed to Lumi:

<a href="https://github.com/lumi-devs/lumi/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=lumi-devs/lumi" alt="Lumi contributors">
</a>

## Security

Security vulnerabilities should be reported responsibly. Review [SECURITY.md](SECURITY.md) or use [GitHub's Private Vulnerability Reporting](https://github.com/lumi-devs/lumi/security/advisories/new).

## License

Distributed under the [GPL v3 License](LICENSE). First-party addons in [lumi-addons](https://github.com/lumi-devs/lumi-addons) are licensed AGPL v3; deployments that load them are subject to AGPL's network source-disclosure requirement for the combined work (GPLv3 §13 / AGPLv3 §13).
