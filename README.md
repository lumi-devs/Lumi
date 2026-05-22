<div align="center">

# 🔥 Ember

### **The Next-Generation Modular Discord Intelligence Engine**

Ember is an ultra-premium, high-performance modular Discord bot built for massive scale, visual sophistication, and zero-compromise developer autonomy. Powered by the raw speed of the **Bun** runtime, structural elegance of **Sapphire v5**, and a state-of-the-art **Redis + RabbitMQ messaging fabric**, Ember sets the benchmark for modern Discord intelligence.

---

[![Bun](https://img.shields.io/badge/Runtime-Bun%20v1.1%2B-000000?style=for-the-badge&logo=bun&logoColor=white)](https://bun.sh)
[![Sapphire](https://img.shields.io/badge/Framework-Sapphire%20v5-24bdf3?style=for-the-badge&logo=sapphire&logoColor=white)](https://www.sapphirejs.dev/)
[![TypeScript](https://img.shields.io/badge/Language-TypeScript%20v5.7-3178c6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Database-Prisma%20v7.8-2d3748?style=for-the-badge&logo=prisma&logoColor=white)](https://www.prisma.io/)
[![RabbitMQ](https://img.shields.io/badge/Messaging-RabbitMQ%20v3-ff6600?style=for-the-badge&logo=rabbitmq&logoColor=white)](https://www.rabbitmq.com/)
[![Redis](https://img.shields.io/badge/Cache-Redis%20v7-dc382d?style=for-the-badge&logo=redis&logoColor=white)](https://redis.io/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ed?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)

**Modular Isolation • Elite Performance • Modern Aesthetics • Event-Driven Autonomy**

</div>

---

## 🌟 The Vision

Ember is not just another utility bot; it is a **highly optimized, resilient micro-framework** engineered for modern server infrastructure. It operates on the philosophy that Discord bots shouldn't just respond to commands—they should function as full-fledged, distributed systems.

By using **Bun's native TypeScript support**, Ember cuts startup times and memory footprints to a fraction of traditional Node.js bots. By enforcing a **zero-coupling feature architecture**, features remain strictly isolated, guaranteeing that bug regressions stay contained and maintenance scales infinitely. Ember moves beyond outdated embeds and text-heavy command walls, adopting an elite **visual system** driven by interactive custom UI components.

---

## 🏛️ Key Architectural Pillars

### 1. 📦 Strict Feature-Based Modularity
Every feature (such as Raid Protection, AFK tracking, or Media Downloads) is an autonomous capsule living in `src/modules/`. Modules:
- Are strictly isolated: **Zero cross-module imports** allowed.
- Manage their own concrete database tables (Prisma) and key schemas (Redis).
- Fully comply with privacy standards using unified, module-specific **GDPR delete protocols** (`deleteUserData`).

### 2. 🎛️ Hybrid Messaging Fabric
Ember features a highly robust dual-protocol communication stack:
- **Redis (RPC Bridge)**: Facilitates low-latency, real-time command, statistics, and configuration synchronization with administrative dashboards.
- **RabbitMQ (AMQP Event Bus & Job Queue)**: Guarantees resilient task execution, distributed state listeners, and reliable delayed job scheduling (such as guild unlocks) that survive bot restarts.

### 3. 🎨 Visual Customization & Brand Identity
Built on a high-contrast aesthetic, Ember rejects generic browser colors in favor of a gorgeous, tailored color palette designed to impress at first glance:

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

Below is the layout of the project, separating global infrastructure, databases, and the isolated module ecosystem:

```text
src/
├── main.ts                    # Entry point: DB connects, builds RPC, logs client in
├── EmberClient.ts             # Client custom initialization & RabbitMQ manager
├── lib/                       # Shared architecture, utilities, and extensions
│   ├── branding.ts            # Palette configuration (Sakura, Lavender, Mint, etc.)
│   ├── cards.ts               # Core UI engine (makeSuccessCard, makeErrorCard, etc.)
│   ├── extensions/            # Base Command/Subcommand classes (EmberCommand)
│   ├── setup/                 # Env validation, prisma client & Redis setup
│   └── structures/            # Shared logic (AntiSpam, ModuleRegistry)
├── redis/                     # Redis cache settings & RPC client bridge
├── rabbitmq/                  # RabbitMQ manager, queues, and job handlers
└── modules/                   # Autonomous feature capsules
    ├── core/                  # Core bot parameters, commands, & overrides
    ├── afk/                   # Custom AFK states & mention notification interceptors
    ├── downloader/            # On-the-fly repository & module downloader
    └── raids/                 # Velocity-based anti-raid system & auto-lockdown
```

---

## ⚡ Core Modules & Features

Every module operates autonomously and registers its own slash commands, database tables, and event listeners.

### 🛡️ Raid Protection (`raids`)
Protects communities from coordinated mass-join attacks.
- **Velocity Tracking**: Utilizes Redis sorted sets to log rolling join events over configurable time windows.
- **Auto-Lockdown**: If join velocity triggers the threshold, the bot escalates the Discord Server Verification Level to `Very High` instantly.
- **Resilient Restoration**: Schedules an `UNLOCK_GUILD` event on the RabbitMQ queue, restoring original server verification settings even if the bot process restarts.

### 📥 Dynamic Downloader (`downloader`)
Enables zero-downtime functional expansion.
- **Repository Management**: Tracks remote Git repositories using `/repo add`, `/repo list`, and `/repo modules`.
- **Hot-loading**: Downloads, registers, and loads new modules from Git in real time via prefix commands (`,download`), updating database records dynamically.

### 📬 AFK State Manager (`afk`)
Keeps members updated about away statuses.
- **Activity Interception**: Activates AFK states via `/afk` and tracks how long users have been away.
- **Mentions Digest**: Safely catches mentions when away, compiling a clean, beautiful notification log.
- **Intelligent Auto-clear**: Clears the AFK status when the user sends their next active message.

### ⚙️ Core Operations (`core`)
Maintains base bot administration and dashboards.
- **Granular Permissions**: Restricts commands by roles or individual members using `/permissions`.
- **System Config**: Dynamically updates features and parameters on the fly via `/config`.
- **Real-Time Synchronizer**: Connects Discord actions to dashboard clients with `/dashboard` and performs ultra-fast `/ping` checks utilizing the Sakura/Rose theme.

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
| `PROMETHEUS_ENABLED` | No | `false` | Enable Prometheus metric scraping endpoints. |
| `PROMETHEUS_PORT` | No | `9090` | Port exposing Prometheus telemetry data. |
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

1. 🚫 **No direct `EmbedBuilder` calls**: Never call `new EmbedBuilder()` or `new MessageEmbed()`. Always route interfaces through the UI factory methods located in `src/lib/util/cards.ts` to enforce uniform high-contrast design.
2. 🛢️ **Utilize direct client containers**: Always access database collections via `this.container.prisma`. Do not wrap Prisma operations in intermediate layers.
3. 📦 **Enforce strict isolation boundaries**: Code residing inside `src/modules/{name}/` must not import anything from `src/modules/{sibling}/`. Shared structures belong in `src/lib/`.
4. 📬 **Throw typed errors**: Never reply directly with error alerts inside commands. Instead, throw typed error structures from `src/core/errors.ts` (e.g. `UserError`, `PermissionError`). The global listener automatically catches and presents these errors in a premium layout.
5. ⚡ **Command registration standards**: User-facing features must register as grouped Slash Commands (e.g., `/permissions set`). Prefix command characters are restricted exclusively to owner admin utilities.

---

<div align="center">
  <p>Engineered with ❤️ by the Ember Core Team.</p>
</div>
