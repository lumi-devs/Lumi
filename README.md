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
    <a href="https://redis.io"><img src="https://img.shields.io/badge/Redis-7%2B-DC382D?style=flat-square&logo=redis&logoColor=white" alt="Redis"></a>
    <a href="https://discord.js.org"><img src="https://img.shields.io/badge/discord.js-v14-5865F2?style=flat-square&logo=discord&logoColor=white" alt="discord.js"></a>
  </p>
</div>

---

Lumi is a modular Discord bot built with Bun, TypeScript, Sapphire Framework, Prisma, and Redis. It separates gateway interactions, background job scheduling, and RPC API serving into independent processes for high stability and horizontal scalability.

Documentation site: **[https://lumi-devs.github.io/Lumi-docs](https://lumi-devs.github.io/Lumi-docs)** (source repo: [lumi-devs/Lumi-docs](https://github.com/lumi-devs/Lumi-docs)).

---

## Architecture

Lumi is organized as a Bun workspace monorepo:

| Path | Purpose |
| :--- | :--- |
| `apps/worker` | Bot gateway runner. Uses `ShardingManager` to spawn shard processes handling Discord events, slash commands, and interaction routing. |
| `apps/scheduler` | Dedicated BullMQ worker and scheduler. Handles recurring tasks, cron schedules, and background worker queues. |
| `apps/api` | Gateway-free HTTP RPC server. Serves typed RPC actions over an internal HTTP bridge. |
| `apps/cli` | Command-line tool (`lumi`) for operations, migrations, addon creation, doctor diagnostics, and service orchestration. |
| `packages/core` | Core framework: database access layer, permit evaluation, sandboxed addon SDK, event bus, and internal modules. |
| `packages/contracts` | Strongly-typed RPC router, schemas, and shared contracts. |
| `packages/observability` | OpenTelemetry tracing, Prometheus metrics exporter, and health probes. |

---

## Features

- **Decoupled Topology**: Discord gateway (`worker`), background queues (`scheduler`), and RPC endpoints (`api`) run in isolated processes.
- **Sandboxed Addon SDK**: Extend bot capabilities through sandboxed addons (`lumi` SDK) with permission checks and signature validation.
- **Granular Permissions**: Hierarchical, node-based permission system (`mod.*`, `admin.*`) checked before command execution.
- **Observability Built-in**: Unified OpenTelemetry distributed tracing and Prometheus metrics endpoints on every service.
- **Robust Storage**: PostgreSQL with Prisma ORM for structured state; Redis for distributed caching, lock leases, and streams.

---

## Quickstart

### Prerequisites

- [Bun](https://bun.sh) (v1.4+) or [Nix](https://nixos.org) with flakes enabled
- [PostgreSQL](https://www.postgresql.org) 16+
- [Redis](https://redis.io) 7+
- Discord Bot Application & Bot Token

### Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/lumi-devs/Lumi.git
   cd Lumi
   ```

2. **Enter development environment:**
   ```bash
   nix develop
   # or ensure bun is installed locally
   ```

3. **Install dependencies:**
   ```bash
   bun install
   ```

4. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your DISCORD_TOKEN, DATABASE_URL, and REDIS_URL
   ```

5. **Initialize database schema:**
   ```bash
   bun run db:generate
   bun run db:deploy
   ```

6. **Run diagnostic checks:**
   ```bash
   bun run doctor
   ```

7. **Start services:**
   ```bash
   # Run all processes concurrently
   bun run dev

   # Or start individual services
   bun run start:worker
   bun run start:scheduler
   bun run start:api
   ```

---

## Development

```bash
# Typecheck root and all workspace packages
bun run typecheck

# Run linter
bun run lint
bun run lint:fix

# Run offline unit test suites
bun run test

# Run integration tests against real databases
bun run test:integration

# Build published SDK bundle
bun run sdk:build
```

---

## Addons & CLI

Lumi includes a command-line tool `lumi` (`apps/cli`):

```bash
# Check service health and environment connectivity
bun run doctor

# Scaffold a new addon module
bun apps/cli/src/main.ts addon create my-addon

# Validate and test an addon
bun apps/cli/src/main.ts addon test my-addon
```

---

## License

Lumi is licensed under the [GNU Affero General Public License v3.0 (AGPL-3.0)](LICENSE).
