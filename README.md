<div align="center">

# 🔥 Ember

### **A modular Discord bot built on Bun and Sapphire**

Ember is a modular Discord bot. Each feature lives in its own isolated module with its own commands, listeners, storage, and config. It runs on the **Bun** runtime, uses the **Sapphire v5** framework, and coordinates state across processes with **Redis** and **RabbitMQ**.

> **Status:** In active development. The module system, config, permissions, and messaging infrastructure are in place; several feature modules are still being built out.

---

[![Bun](https://img.shields.io/badge/Runtime-Bun%20v1.1%2B-000000?style=for-the-badge&logo=bun&logoColor=white)](https://bun.sh)
[![Sapphire](https://img.shields.io/badge/Framework-Sapphire%20v5-24bdf3?style=for-the-badge&logo=sapphire&logoColor=white)](https://www.sapphirejs.dev/)
[![TypeScript](https://img.shields.io/badge/Language-TypeScript%20v5.7-3178c6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Database-Prisma%20v7.8-2d3748?style=for-the-badge&logo=prisma&logoColor=white)](https://www.prisma.io/)
[![RabbitMQ](https://img.shields.io/badge/Messaging-RabbitMQ%20v3-ff6600?style=for-the-badge&logo=rabbitmq&logoColor=white)](https://www.rabbitmq.com/)
[![Redis](https://img.shields.io/badge/Cache-Redis%20v7-dc382d?style=for-the-badge&logo=redis&logoColor=white)](https://redis.io/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ed?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)

**Modular isolation • Bun runtime • Redis + RabbitMQ • Component-based UI**

</div>

---

## 🏛️ Architecture

### 1. 📦 Feature-based modularity
Every feature is a self-contained module under `src/modules/`. Modules:
- Avoid cross-module imports — shared code lives in `src/core/` and `src/utilities/`.
- Own their database tables (Prisma) and Redis key namespaces.
- Implement a `deleteUserData` hook for GDPR-style data removal.
- Declare config fields and metadata via the `@EmberModule` decorator.

The module store discovers modules at runtime, resolves dependencies, and detects conflicts.

### 2. 🎛️ Messaging
Ember uses two transports:
- **Redis** — caching and config storage, plus **BullMQ** for durable scheduled tasks (delayed/exact-time/repeated jobs that survive restarts).
- **RabbitMQ** — cross-process fanout events and the RPC bridge for low-latency request/response with the web dashboard.

### 3. 🎨 Card-based UI
User-facing output is built through card factories in `src/utilities/cards.ts` (using Discord's components, not classic embeds), with a shared color palette:

| Color | Hex Value | Purpose |
| :--- | :--- | :--- |
| **Blurple** | `#5865f2` | Primary branding, buttons, and notifications |
| **Sakura** | `#ffb7c5` | Soft Pink — Optimal network latency & performance dashboards |
| **Lavender** | `#a78bfa` | Soft Purple — Information cards, stats overview |
| **Mint** | `#34d399` | Soft Green — Guild configuration & healthy systems |
| **Peach** | `#fba190` | Soft Peach — Minor warning states and transient statuses |
| **Rose** | `#f43f5e` | Vibrant Rose — Severe performance lag & critical errors |
| **Amber** | `#f59e0b` | Warm Amber — Moderate warning thresholds |

---

## 📂 Directory Structure

```text
src/
├── main.ts          # Entry point
├── client/          # EmberClient setup and login
├── core/            # Shared infrastructure
│   ├── module-system/   # Module base class, ModuleStore, Service base
│   ├── services/        # ConfigService, PermissionService, DownloaderService
│   ├── commands/        # Core admin commands (config, permissions, module, help)
│   ├── rabbitmq/        # Job queue manager and handlers
│   ├── routes/          # HTTP routes (health)
│   └── lib/             # Shared helpers (gdpr, ping, downloader, etc.)
├── database/        # Prisma client and Redis setup
├── utilities/       # cards, assets, branding, errors, config
├── tasks/           # Scheduled tasks
├── workers/         # Worker thread management
├── languages/       # i18n resources
└── modules/         # Feature modules
    ├── afk/             # AFK states and mention digests
    ├── dashboard/       # Dashboard RPC handlers
    ├── emoji-stealer/   # Emoji import utilities
    ├── filter/          # Word filter (config scaffold)
    ├── mod/             # Moderation commands (ban, kick, timeout, cases, etc.)
    ├── utility/         # Misc utilities (purge, nick, media, thread cleaner)
    └── verify/          # Member verification (config scaffold)
```

---

## ⚡ Modules & Features

Each module registers its own commands, listeners, and storage.

### ⚙️ Core operations
Built into `src/core/`, available on every install.
- **Permissions** — restrict commands by role or member via `/permissions`, layered over built-in permission levels.
- **Config** — view and change module settings at runtime via `/config`.
- **Modules** — install and hot-reload modules from tracked Git repositories (`/repo`, `,download`, `/module`).
- **Health & ping** — `/ping` latency checks and an HTTP health route.

### 📬 AFK (`afk`)
- Sets AFK status via `/afk` and tracks elapsed time.
- Catches mentions while away and compiles a digest.
- Auto-clears when the user next sends a message.

### 🔨 Moderation (`mod`)
- `ban`, `kick`, `timeout`, `quarantine`, `sanitize` actions with audit logging.
- Case tracking via `cases`.

### 🧰 Utility (`utility`)
- `purge` with bulk/slow-delete fallback, `nick`, user media tools, and a thread cleaner.

### 🧩 Scaffolds
`filter` (word filter) and `verify` (captcha verification) currently define their config schema only — behavior is not yet implemented.

---

## 🚀 Installation & Deployment

Ember supports two setup types depending on your hosting requirements.

### Option A: Docker Compose (Recommended)
Docker Compose automatically boots the database, cache, message broker, and the bot runtime in isolated networks.

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/your-username/ember-ts.git
   cd ember-ts
   ```

2. **Configure Environment Variables**:
   Create a `.env` file by copying the template and supplying your Discord tokens:
   ```bash
   cp .env.example .env
   ```
   *(Ensure `BOT_TOKEN` and `CLIENT_ID` are configured inside `.env`)*

3. **Start in Development Mode**:
   Development mode supports hot-reloading (bot code reloads instantly on file changes) and binds local folders:
   ```bash
   docker compose up
   ```

4. **Start in Production Mode**:
   Production mode compiles a single-bundle target, optimizes garbage collection, and monitors resource boundaries:
   ```bash
   docker compose --profile production up -d
   ```

*Note: During startup, database migrations are automatically pushed and the Prisma client is updated.*

---

### Option B: Bare-Metal Setup
To run Ember locally without Docker, you must have **Bun (v1.1+)**, **PostgreSQL (v16)**, and **Redis (v7)** installed on your machine. RabbitMQ is optional (Ember will gracefully switch to Redis-only mode if RabbitMQ is unavailable).

1. **Install Dependencies**:
   ```bash
   bun install
   ```

2. **Configure Local Services**:
   Copy `.env.example` to `.env` and specify local host addresses:
   ```bash
   cp .env.example .env
   ```

3. **Initialize Database Schema**:
   Sync your local PostgreSQL database with the Prisma schema and generate types:
   ```bash
   bun run db:generate
   bun run db:push
   ```

4. **Launch the Engine**:
   Start the bot with hot-reloading:
   ```bash
   bun run dev
   ```

---

## ⚙️ Environment Configuration

Ember validates the environment at boot. Below are the key configuration options:

### 🔑 Authentication & Core
| Variable | Required | Default | Purpose |
| :--- | :---: | :--- | :--- |
| `BOT_TOKEN` | **Yes** | — | Discord application bot authorization token. |
| `CLIENT_ID` | **Yes** | — | Discord Application ID used for slash command registration. |
| `OWNER_IDS` | No | — | Comma-separated Discord User IDs representing Bot Owners. |
| `DEFAULT_PREFIX` | No | `,` | Legacy character used for system administration commands. |
| `NODE_ENV` | No | `development` | Operating environment (`development` or `production`). |

### 🛢️ Databases & Microservices
| Variable | Required | Default | Purpose |
| :--- | :---: | :--- | :--- |
| `POSTGRES_URL` | **Yes** | `postgresql://...` | Connection URI for the main PostgreSQL storage engine. |
| `REDIS_HOST` | **Yes** | `localhost` | Host address of your Redis memory store. |
| `REDIS_PORT` | No | `6379` | Port bound to the Redis caching instance. |
| `REDIS_PASSWORD` | No | `ember` | Authorization password for Redis. |
| `REDIS_CACHE_DB` | No | `0` | Database index allocated for caching and configuration data. |
| `REDIS_TASK_DB` | No | `1` | Database index allocated for Sapphire scheduled events. |
| `RABBITMQ_URL` | No | `amqp://...` | Connection string for RabbitMQ. If omitted, queues run on Redis. |

### 📈 Metrics, Logs & Cache
| Variable | Required | Default | Purpose |
| :--- | :---: | :--- | :--- |
| `LOG_LEVEL` | No | `info` | Minimum log severity to output (`debug`, `info`, `warn`, `error`). |
| `SENTRY_ENABLED` | No | `false` | Enable Sentry application telemetry and error tracking. |
| `SENTRY_DSN` | No | — | Endpoint address for your Sentry workspace. |
| `EMBER_CACHE_TTL` | No | `60` | Duration (seconds) for caching guild configuration records in Redis. |

---

## 🛠️ Developer Scripts Reference

Use these scripts during development and deployment:

| Command | Action | Execution Scope |
| :--- | :--- | :--- |
| `bun run dev` | `bun --watch src/main.ts` | Launches the hot-reloading development server. |
| `bun run start` | `bun src/main.ts` | Runs the bot directly in TypeScript (optimized for Bun). |
| `bun run build` | `bun build ...` | Generates a single-file production bundle in `dist/`. |
| `bun run start:dist` | `bun dist/main.js` | Launches the pre-bundled production javascript package. |
| `bun run typecheck` | `tsc --noEmit` | Validates TypeScript types across all source folders. |
| `bun run lint` | `eslint src` | Checks formatting and code style, auto-fixing when possible. |
| `bun run db:generate` | `prisma generate` | Generates the strongly typed local Prisma client. |
| `bun run db:push` | `prisma db push` | Pushes the local schema directly to Postgres (avoids migrations). |
| `bun run db:migrate` | `prisma migrate dev`| Creates and tracks production-grade SQL migrations. |
| `bun run db:studio` | `prisma studio` | Launches a web database GUI at `http://localhost:5555`. |
| `bun run clean` | `rimraf dist/` | Removes pre-existing compilation artifacts. |

---

## ⚜️ Developer Golden Mandates

To contribute or write custom extensions for Ember, you **MUST** follow these core guidelines:

1. 🚫 **No direct `EmbedBuilder` calls**: Build user-facing output through the card factories in `src/utilities/cards.ts` (e.g. `makeSuccessCard`, `makeErrorCard`) rather than constructing embeds directly.
2. 🛢️ **Access storage through the container**: Use `this.container.db` / `this.container.prisma` and `this.container.redis`. Don't add intermediate wrapper layers.
3. 📦 **Respect isolation boundaries**: Code in `src/modules/{name}/` must not import from a sibling module. Shared code belongs in `src/core/` or `src/utilities/`.
4. ⚡ **Command registration**: User-facing features register as slash commands (grouped where it makes sense, e.g. `/permissions set`). Prefix commands are reserved for bot-owner admin utilities.

---

## 📄 License

This project is licensed under the **Apache License 2.0**. 

Under this license, you are free to use, modify, distribute, and commercially exploit the codebase. However, per **Section 6 (Trademarks)**, this license does **NOT** grant you permission to use the "Ember" brand, trademarks, logos, or product names. Any modified or redistributed versions of this software **must be completely renamed and rebranded**.

---

<div align="center">
  <p>Engineered with ❤️ by the Ember Core Team.</p>
</div>
