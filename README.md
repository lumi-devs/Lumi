<div align="center">
  <img src="assets/banner.png" alt="Lumi" width="800">

  <h3>The self-hosted, modular Discord bot for communities that want control.</h3>

  <p>
    <a href="https://github.com/lumi-devs/lumi/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/lumi-devs/lumi/ci.yml?branch=main&style=flat-square&label=CI&logo=github" alt="CI"></a>
    <a href="https://github.com/lumi-devs/lumi/actions/workflows/security.yml"><img src="https://img.shields.io/github/actions/workflow/status/lumi-devs/lumi/security.yml?branch=main&style=flat-square&label=Security&logo=github" alt="Security"></a>
    <a href="https://codecov.io/gh/lumi-devs/lumi"><img src="https://codecov.io/gh/lumi-devs/lumi/branch/main/graph/badge.svg" alt="Coverage"></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/License-GPL%20v3-A42E2B?style=flat-square&logo=gnu&logoColor=white" alt="GPL v3"></a>
  </p>

  <p>
    <a href="https://bun.sh"><img src="https://img.shields.io/badge/Bun-1.3%2B-000000?style=flat-square&logo=bun&logoColor=white" alt="Bun"></a>
    <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-5.x%20%2F%206.x-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript"></a>
    <a href="https://www.postgresql.org"><img src="https://img.shields.io/badge/PostgreSQL-18-4169E1?style=flat-square&logo=postgresql&logoColor=white" alt="PostgreSQL"></a>
    <a href="https://redis.io"><img src="https://img.shields.io/badge/Redis-8-DC382D?style=flat-square&logo=redis&logoColor=white" alt="Redis"></a>
    <a href="https://discord.js.org"><img src="https://img.shields.io/badge/discord.js-v14-5865F2?style=flat-square&logo=discord&logoColor=white" alt="discord.js"></a>
    <a href="https://nextjs.org"><img src="https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=next.js&logoColor=white" alt="Next.js"></a>
  </p>

  <p>
    <a href="#key-features">Features</a> •
    <a href="#self-hosting">Self-Hosting</a> •
    <a href="#architecture">Architecture</a> •
    <a href="#data-privacy--gdpr">Privacy & GDPR</a> •
    <a href="https://lumi-devs.github.io/Lumi/">Docs</a> •
    <a href="#contributing">Contributing</a> •
    <a href="#license">License</a>
  </p>
</div>

---

## Overview

Lumi is a self-hosted, modular Discord bot built for communities that demand full control, rock-solid security, and high performance. Every feature is a hot-swappable module: toggle, configure, and extend without restarting the bot or touching core code.

Built with **Bun**, **TypeScript**, **discord.js v14**, and the **[Sapphire Framework](https://sapphirejs.dev)**. Backed by **PostgreSQL 18** (via Prisma) and **Redis 8**, with a **Next.js 16** admin dashboard.

---

## Key Features

- 🧩 **Modular by design** — `afk`, `core`, `dashboard`, `filter`, `logging`, `mod`, `security`, `tempvc`, and `utility` modules can each be toggled, configured, and hot-reloaded independently.
- 🛡️ **Full GDPR & privacy compliance** — self-service data export (`/mydata getmydata`), right to erasure (`/mydata forgetme`), mandatory addon data statements (`/mydata 3rdparty`), and automated retention sweeps.
- ⚡ **Next.js 16 web dashboard** — real-time server management over an internal HTTP RPC bridge, with server-side auth guards and module controls.
- 🔌 **Typed addon SDK** — build custom community modules against a stable public API (`lumi`, `lumi/commands`, `lumi/permissions`, `lumi/scheduling`, `lumi/ui`, `lumi/utils`) with zero access to internal core code.
- 📡 **Horizontally scalable** — every worker process is identical; shard 0 self-elects as primary for job scheduling, and Redis Streams/BullMQ drive the task queue.
- 🌍 **Community-translatable** — localization managed centrally and synced through Crowdin.

---

## Why self-host Lumi?

- **You own the data.** No third-party SaaS dashboard holding your server's moderation logs, member data, or config — it lives in your own Postgres instance.
- **No black-box moderation.** Every module is TypeScript you can read, audit, and patch, not a closed API.
- **Extend without forking.** The addon SDK gives third-party modules a stable, isolated surface, so custom features don't require touching core.
- **Built to scale, not just to demo.** The same worker process model runs a single shard on a Raspberry Pi or a disjoint `SHARD_LIST` across a fleet — no separate "enterprise" architecture.

---

## Self-Hosting

### Requirements

- [**Bun**](https://bun.sh) 1.3+ — runtime and package manager (always required, Docker or not)
- A **Discord application** — bot token + client ID from the [Developer Portal](https://discord.com/developers/applications)
- **PostgreSQL 18** and **Redis 8** — either via [Docker](https://docs.docker.com/get-docker/) or installed natively

### Quick Start (production, Docker)

```sh
git clone https://github.com/lumi-devs/lumi.git && cd lumi
cp .env.example .env
$EDITOR .env   # set BOT_TOKEN, CLIENT_ID, RPC_INTERNAL_TOKEN, and Postgres/Redis passwords

docker pull ghcr.io/lumi-devs/lumi:latest
docker compose up -d
```

### Quick Start (local development)

The interactive wizard builds `.env`, verifies your bot token, and offers to start Postgres/Redis for you:

```sh
git clone https://github.com/lumi-devs/lumi.git && cd lumi
bun install
bun run setup
```

Or set it up by hand — with Docker for the datastores:

```sh
cp .env.example .env
$EDITOR .env                                       # fill in BOT_TOKEN, CLIENT_ID at minimum
docker compose up -d postgres pgbouncer redis
bun install
bun run db:generate
bun run db:migrate
bun run dev
```

Or with a [Nix](https://nixos.org) dev shell, which provisions native Postgres/Redis alongside Bun:

```sh
nix develop   # or: nix-shell
cp .env.example .env && $EDITOR .env
bun install
bun run db:generate
bun run db:migrate
bun run dev
```

For scaled-out deployments (multiple `worker` replicas), set `CLUSTER_NAME` and give each replica a disjoint `SHARD_LIST` so they divide the shard range between themselves.

Full step-by-step guide, including environment variables, the dashboard, and updates: [Self-Hosting Guide](https://lumi-devs.github.io/Lumi/guides/self-hosting) ([source](apps/docs/src/content/docs/guides/self-hosting.md)).

---

## Architecture

Every worker process is identical — there's no separate scheduler role. `apps/worker/src/main.ts` is a lightweight discord.js `ShardingManager` that spawns one child process per shard it owns; each child holds a real Discord Gateway WebSocket connection and runs all slash commands, listeners, and module logic in the same process.

Gateway ingestion and bot logic intentionally live in one process. Scaling is horizontal: set `CLUSTER_NAME` and give each replica a disjoint `SHARD_LIST`. Exactly one shard per pod — the one holding shard id `0` — is elected "primary" with zero coordination and owns BullMQ job scheduling and the RPC/metrics HTTP surface. Multi-replica deployments route REST traffic through a shared `nirn-proxy` (`DISCORD_PROXY_URL`) so rate-limit buckets stay coordinated.

Task queueing runs on **Redis Streams**/BullMQ; the dashboard talks to the worker over an **internal HTTP RPC bridge**. Full details: [Architecture Reference](https://lumi-devs.github.io/Lumi/architecture).

---

## Data Privacy & GDPR

Lumi is engineered with privacy-by-design and full GDPR compliance:

- **Right of Access (Article 15)** — users can export all personal data stored across the bot via `/mydata getmydata` or the web dashboard.
- **Right to Erasure (Article 17)** — users can permanently purge and anonymize their profile, AFK data, and channel associations with `/mydata forgetme`.
- **Addon privacy transparency** — every third-party module is required to declare an `end_user_data_statement` manifest, inspectable via `/mydata 3rdparty`.
- **Automated data retention** — stale audit ledgers and expired cases are automatically purged by scheduled sweeps.

---

## Translations

Lumi uses **Crowdin** to manage localization across multiple languages. All localized strings are managed centrally in `packages/core/src/languages/en-US/`.

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
