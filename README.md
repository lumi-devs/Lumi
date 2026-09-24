<div align="center">
  <img src="assets/banner.png" alt="Lumi" width="800">

  <h3>The self-hosted, modular Discord bot for communities that want control.</h3>

  <p>
    <a href="https://github.com/lumi-devs/Lumi/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/lumi-devs/Lumi/ci.yml?branch=main&style=flat-square&label=CI&logo=github" alt="CI"></a>
    <a href="https://github.com/lumi-devs/Lumi/actions/workflows/security.yml"><img src="https://img.shields.io/github/actions/workflow/status/lumi-devs/Lumi/security.yml?branch=main&style=flat-square&label=Security&logo=github" alt="Security"></a>
    <a href="https://codecov.io/gh/lumi-devs/Lumi"><img src="https://codecov.io/gh/lumi-devs/Lumi/branch/main/graph/badge.svg" alt="Coverage"></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/License-GPL%20v3-A42E2B?style=flat-square&logo=gnu&logoColor=white" alt="GPL v3"></a>
    <a href="https://lumi-devs.github.io/Lumi/"><img src="https://img.shields.io/badge/docs-lumi--devs.github.io-4C6EF5?style=flat-square&logo=gitbook&logoColor=white" alt="Documentation"></a>
  </p>

  <p>
    <a href="https://bun.sh"><img src="https://img.shields.io/badge/Bun-1.3%2B-000000?style=flat-square&logo=bun&logoColor=white" alt="Bun"></a>
    <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-6.x-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript"></a>
    <a href="https://www.postgresql.org"><img src="https://img.shields.io/badge/PostgreSQL-18-4169E1?style=flat-square&logo=postgresql&logoColor=white" alt="PostgreSQL"></a>
    <a href="https://redis.io"><img src="https://img.shields.io/badge/Redis-7%2B-DC382D?style=flat-square&logo=redis&logoColor=white" alt="Redis"></a>
    <a href="https://discord.js.org"><img src="https://img.shields.io/badge/discord.js-v14-5865F2?style=flat-square&logo=discord&logoColor=white" alt="discord.js"></a>
    <a href="https://nextjs.org"><img src="https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=nextdotjs&logoColor=white" alt="Next.js"></a>
  </p>

  <p>
    <a href="#quickstart">Quickstart</a>
    •
    <a href="https://lumi-devs.github.io/Lumi/">Documentation</a>
    •
    <a href="#addons">Addons</a>
    •
    <a href="#architecture">Architecture</a>
    •
    <a href="#privacy--gdpr">Privacy</a>
    •
    <a href="#license">License</a>
  </p>
</div>

---

**Lumi** is a self-hosted, fully modular Discord bot built with [Bun](https://bun.sh), the [Sapphire Framework](https://sapphirejs.dev), and [Redis Streams](https://redis.io).

Every feature in Lumi is an independent module that can be enabled or disabled per server from `/module` or the web dashboard. Community addons can be installed from Git repositories via an in-chat Downloader or authored with the typed `lumi` SDK. An optional Next.js web dashboard talks to the worker over an internal RPC bridge without requiring direct database access.

See the [documentation site](https://lumi-devs.github.io/Lumi/) for the full list of modules and what each one does.

---

## Quickstart

### Docker Compose (Recommended)

The fastest way to deploy a complete instance (bot worker, PostgreSQL 18, PgBouncer, Redis, and dashboard):

```sh
mkdir lumi && cd lumi
curl -fsSL https://raw.githubusercontent.com/lumi-devs/Lumi/main/docker-compose.yml -o docker-compose.yml
curl -fsSL https://raw.githubusercontent.com/lumi-devs/Lumi/main/.env.example -o .env

# Edit .env and configure your BOT_TOKEN and CLIENT_ID
# Generate secrets with: openssl rand -hex 32
$EDITOR .env

docker compose up -d
```

The bot connects to Discord, and the web admin dashboard will be available at `http://localhost:8080`.

For step-by-step guidance on reverse proxies, TLS, and shard scaling, see the [Self-Hosting Guide](https://lumi-devs.github.io/Lumi/guides/self-hosting).

---

### Running from Source

Requires [Bun 1.3+](https://bun.sh) and running PostgreSQL and Redis instances:

```sh
git clone https://github.com/lumi-devs/Lumi.git
cd Lumi

cp .env.example .env && $EDITOR .env

bun install
bun run db:generate
bun run db:migrate
bun run dev
```

If you use [Nix](https://nixos.org), run `nix develop` to enter a development shell with Bun, PostgreSQL, Redis, and tools preconfigured.

---

## Addons

Lumi includes a Downloader system for installing third-party addons directly from Git repositories:

```sh
# Register a repository
,repo add lumi-addons https://github.com/lumi-devs/lumi-addons.git

# Install an addon
,download install lumi-addons custom-roles

# Enable it in your server
/module enable custom-roles
```

### Authoring an Addon

Addons are authored in TypeScript using the `lumi` SDK. Scaffold a new module in seconds:

```sh
bun run addon:create my-addon --dir ./addons
```

Addons define their configuration schema with Zod, listen to Redis Streams, and register slash commands:

```typescript
import { DefineModule, Module, type ModuleContext } from "lumi";
import { z } from "zod";

const ConfigSchema = z.object({
  greeting: z.string().default("Welcome to the server!"),
});

export default DefineModule({
  name: "custom-greeter",
  displayName: "Custom Greeter",
  version: "1.0.0",
  configSchema: ConfigSchema,
  requiredPermissions: ["MANAGE_MESSAGES"],

  async onLoad(ctx: ModuleContext) {
    ctx.logger.info("Custom greeter loaded on shard", ctx.shardId);
  },
});
```

Validate your addon before distributing:

```sh
bun run validate ./addons/my-addon
```

Read the [Module Creation Guide](https://lumi-devs.github.io/Lumi/guides/module-creation) and [API Reference](https://lumi-devs.github.io/Lumi/api-reference) for complete documentation.

---

## Architecture

```
                       Discord Gateway (WebSocket)
                                   │
                                   ▼
                   ┌──────────────────────────────┐
                   │ apps/worker (ShardingManager)│
                   │   Shard #0 ─── Shard #1 ...  │
                   └──────────────┬───────────────┘
                                  │
          ┌───────────────────────┼──────────────────────┐
          ▼                       ▼                      ▼
┌──────────────────┐   ┌────────────────────┐  ┌────────────────────┐
│   Redis 7 / 8    │   │  PgBouncer (6432)  │  │  Next.js 16 App    │
│  - Event Streams │   │        │           │  │  - Web Dashboard   │
│  - BullMQ Tasks  │   │  PostgreSQL 18     │  │  - Token RPC (8091)│
│  - L1/L2 Cache   │   │  - Durable Storage │  │  - Permit RBAC     │
└──────────────────┘   └────────────────────┘  └────────────────────┘
```

- **Process Model**: `apps/worker` is a `ShardingManager` that spawns child processes per assigned shard. Shard child processes connect to the Discord Gateway and execute command logic in-process.
- **Primary Shard**: Shard `0` binds the HTTP RPC server (port `8091`) and Prometheus `/metrics` scraper (port `9090`).
- **Web Dashboard**: Built with Next.js 16 App Router. Holds no bot tokens and opens no database connections; all reads and writes flow through the authenticated RPC bridge.
- **Concurrency & Caching**: Single-flight L1 prefix caching and distributed Redis mutexes prevent database stampedes during high-volume events.

See the full [Architecture Reference](https://lumi-devs.github.io/Lumi/architecture) for detailed system specifications.

---

## Privacy & GDPR

Lumi is built for self-hosters who prioritize data sovereignty:

- **Zero Telemetry**: Lumi collects no analytics and never phones home. All data stays inside your database.
- **Right of Access (Article 15)**: Users can export all stored data associated with their account via `/mydata getmydata` or through the dashboard.
- **Right to Erasure (Article 17)**: Users can purge and anonymize their profile, notes, and records with `/mydata forgetme`.
- **Automated Retention Sweeps**: Scheduled daily cron tasks purge stale audit logs and expired moderation cases.

---

## Testing

The test suite runs with 100% offline mock drivers and requires no running services:

```sh
# Run all unit and integration tests
bun run test

# Run type checks across all packages
bun run typecheck

# Run linter
bun run lint
```

---

## Translations

Translations are managed with [Crowdin](https://crowdin.com). All locale strings live under `packages/core/src/languages/{locale}/`.

Contributions for new languages and corrections are welcome.

---

## License

Lumi is licensed under the [GNU General Public License v3.0 (GPL-3.0)](LICENSE).

Third-party addons written with the public `lumi` SDK may be licensed independently under the author's choice of terms when distributed outside the core repository.
