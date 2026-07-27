<div align="center">
  <br />
  <img src="assets/banner.png" alt="Lumi Mascot Banner" width="800" style="border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
  <br />
  
  <h1>✨ Lumi</h1>
  
  <p><b>Your Modern, Modular, and Microservice-Ready Discord Companion</b></p>

  <div align="center">
    <a href="https://bun.sh"><img src="https://img.shields.io/badge/Bun-1.1+-black?style=for-the-badge&logo=bun" alt="Bun"></a>
    <a href="https://sapphirejs.dev"><img src="https://img.shields.io/badge/Sapphire-v5-blue?style=for-the-badge" alt="Sapphire"></a>
    <a href="https://discord.js.org"><img src="https://img.shields.io/badge/Discord.js-v14-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Discord.js"></a>
    <a href="https://opentelemetry.io"><img src="https://img.shields.io/badge/OpenTelemetry-Enabled-purple?style=for-the-badge" alt="OpenTelemetry"></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/License-AGPL%20v3.0-green?style=for-the-badge" alt="License"></a>
  </div>
  <br />
</div>

<details open>
  <summary><b>📖 Table of Contents</b></summary>
  <ol>
    <li><a href="#-introduction">Introduction</a></li>
    <li><a href="#-key-features">Key Features</a></li>
    <li><a href="#-microservices-architecture">Microservices Architecture</a></li>
    <li><a href="#-quick-start">Quick Start</a></li>
    <li><a href="#-documentation-sitemap">Documentation Sitemap</a></li>
    <li><a href="#-built-in-modules">Built-in Modules</a></li>
    <li><a href="#-monorepo-subpackages">Monorepo Subpackages</a></li>
    <li><a href="#-faq--support">FAQ & Support</a></li>
    <li><a href="#-license--trademark">License & Trademark</a></li>
  </ol>
</details>

---

## 🌟 Introduction

Lumi is an **open-standard**, **highly scalable**, and **fully modular** Discord bot engineered for server management, moderation, and community engagement. Inspired by open reference standards like Skyra and Red-DiscordBot, Lumi provides an adaptable framework where server administrators enable only the feature modules they need.

Built on **Bun**, **Sapphire Framework v5**, **Discord.js v14**, **Prisma PostgreSQL**, **Redis**, and **RabbitMQ**, Lumi runs seamlessly as a single-process `monolith` or scales out into a distributed cluster of `Gateway`, `Worker`, and `Scheduler` microservices.

---

## ✨ Key Features

- **🧩 Dynamic Module System**: Per-guild feature toggles and configuration with auto-derived Shapeshift schemas. Zero cross-module dependencies.
- **⚡ Distributed Event Bus**: Decoupled Gateway-to-Worker event streaming via `Redis Streams` or `NATS JetStream` (with `inproc` fallback for monoliths).
- **🐇 RabbitMQ RPC & Fanout**: Inter-process communication for web dashboard configuration and cross-service notifications.
- **⏰ BullMQ Scheduled Tasks**: Reliable background task processing with grace-period catch-up evaluation (`RelayTask`).
- **🛡️ Enterprise Moderation & Auto-Filter**: Full moderation suite (ban, kick, timeout, quarantine, warn) and regex-based message filter with action thresholds.
- **🌐 Web Dashboard**: Browser-based admin interface (`apps/dashboard`) communicating statelessly over RabbitMQ RPC.
- **🗣️ Multi-Locale i18n**: Built-in translation support (`en-US`, `de`, `es-ES`, `fr`) using `@sapphire/plugin-i18next`.
- **📊 OpenTelemetry & Metrics**: Native OpenTelemetry tracing and Prometheus metrics endpoint (`METRICS_PORT=9090`).

---

## 🏛️ Microservices Architecture

Lumi supports two execution topologies based on the `LUMI_ROLE` environment variable:

1. **Monolith Mode** (`LUMI_ROLE=monolith`): All WebSocket handling, module execution, task scheduling, and database access take place in a single process.
2. **Distributed Microservices Mode**:
   - **`apps/gateway`**: Manages Discord WebSocket shards and streams `RawGatewayEnvelope` payloads over `@lumi/event-bus`.
   - **`apps/worker`**: Stateless nodes consuming Gateway payloads, executing commands, running module listeners, and responding to RPC.
   - **`apps/scheduler`**: Owns BullMQ queues, evaluates task catch-up policies, and fires execution events.
   - **`apps/dashboard`**: Web portal providing OAuth2 login and sending configuration updates over RabbitMQ RPC.

```
                           ┌──────────────────────────┐
                           │   Discord Gateway WS     │
                           └─────────────┬────────────┘
                                         │
                                         ▼
                                ┌─────────────────┐
                                │  apps/gateway   │
                                └────────┬────────┘
                                         │ (@lumi/event-bus)
                                         │ Redis Streams / NATS JetStream
                                         ▼
                                ┌─────────────────┐
  ┌──────────────────┐  RPC     │   apps/worker   │ ◄── Task Fire Events
  │  apps/dashboard  ├─────────►│   (Stateless)   │ (lumi.scheduler.fire)
  └──────────────────┘ RabbitMQ └────────┬────────┘
                                         │
                                         ▼
                               ┌───────────────────┐
                               │ PostgreSQL / Redis│
                               └───────────────────┘
                                         ▲
                                         │ BullMQ Queue
                                ┌────────┴─────────┐
                                │  apps/scheduler  │
                                └──────────────────┘
```

---

## 🚀 Quick Start

### 🐳 Method 1: Docker Compose (Recommended)

Run the full Lumi stack (PostgreSQL, Redis, RabbitMQ, and Lumi Monolith):

```bash
# 1. Clone repo and copy environment template
git clone https://github.com/lumi-devs/lumi.git && cd lumi
cp .env.example .env

# 2. Configure credentials in .env
# Set BOT_TOKEN and CLIENT_ID

# 3. Launch single-node monolith stack
docker compose up -d

# Or launch the distributed profile (Gateway + Worker + Scheduler + Dashboard)
docker compose --profile distributed up -d
```

### 💻 Method 2: Bare Metal (Development)

Requires [Bun 1.1+](https://bun.sh), PostgreSQL 16+, and Redis 7+:

```bash
# 1. Install workspace dependencies
bun install

# 2. Generate Prisma client & push schema
bun run db:generate
bun run db:push

# 3. Start development monolith
bun run dev
```

---

## 🗺️ Documentation Sitemap

For in-depth guides, configuration details, architectural specifications, and reference documentation, consult the core documentation suite in `docs/`:

| Guide | Description |
|---|---|
| 📐 **[Architecture Guide](docs/architecture.md)** | Microservices topology, sequence flow diagrams (Gateway event dispatching, Dashboard RPC, BullMQ `RelayTask`), and monorepo package breakdown. |
| 🛠️ **[Module Development Guide](docs/module-development.md)** | Step-by-step developer guide covering `@DefineModule`, `BaseCommand`, `Service`, `ModuleListener`, card utilities, permissions, i18n, and strict anti-patterns. |
| 📜 **[Command & Module Reference](docs/command-reference.md)** | Exhaustive catalog for all 8 built-in modules (`afk`, `core`, `dashboard`, `filter`, `logging`, `mod`, `tempvc`, `utility`) detailing commands, subcommands, options, and background tasks. |
| ⚙️ **[Configuration Reference](docs/configuration.md)** | Master environment variable index, transport matrix (`inproc`, `streams`, `nats`), and Shapeshift schema rules. |
| 🚢 **[Deployment Guide](docs/deployment.md)** | Production deployment workflows for Docker Compose, distributed roles, Kubernetes/KEDA scaling (`deploy/k8s/`), and Prisma DB push vs migrations. |
| 🔒 **[Security & Privacy Policy](docs/security-and-privacy.md)** | Security model notice (addon trust & process privilege), Discord data privacy policy (retention, stored fields, deletion handling), and DB/Redis standards. |

---

## 📦 Built-in Modules

Lumi includes 8 core modules out of the box:

- **`afk`**: User AFK status tracking with automatic mention alerts and activity reset.
- **`core`**: Core system configuration (`/lumi panel`, `/module enable|disable|list`).
- **`dashboard`**: RabbitMQ RPC service adapter connecting `@lumi/dashboard` with worker nodes.
- **`filter`**: Automated regex-based chat filtering, invite link blocking, and spam prevention.
- **`logging`**: Comprehensive guild audit logging for message, member, and moderation events.
- **`mod`**: Advanced moderation suite (`/ban`, `/kick`, `/timeout`, `/warn`, `/quarantine`, `/purge`) with timed auto-reversals.
- **`tempvc`**: Dynamic temporary voice channel generation on user join and automated cleanup on empty.
- **`utility`**: Essential community utility commands (`/serverinfo`, `/whois`, `/avatar`, `/ping`, `/help`, `/botinfo`).

---

## 📂 Monorepo Subpackages

| Path | Package / App | Description |
|---|---|---|
| `apps/dashboard` | `@lumi/dashboard` | Web dashboard application providing browser-based guild configuration over RabbitMQ RPC. |
| `apps/gateway` | `@lumi/gateway` | Lightweight Discord WebSocket manager streaming raw events to event bus. |
| `apps/scheduler` | `@lumi/scheduler` | Owns BullMQ scheduled task queues and publishes execution events. |
| `apps/worker` | `@lumi/worker` | Stateless event & command processing worker node. |
| `packages/contracts` | `@lumi/contracts` | Shared wire contracts, RPC action maps, and manifest schemas. |
| `packages/core` | `@lumi/core` | Core framework library, `LumiClient`, module store, DB facade, and cards. |
| `packages/event-bus` | `@lumi/event-bus` | Pluggable event bus abstraction (`inproc`, `streams`, `nats`). |
| `packages/observability` | `@lumi/observability` | OpenTelemetry tracing, Pino logger, Prometheus metrics, and drain handlers. |
| `packages/sdk` | `@lumi/sdk` | Public developer SDK for constructing third-party Lumi addons. |
| `packages/sharding` | `@lumi/sharding` | Redis-backed sharding coordinator and dynamic websocket strategy. |
| `config/` | — | Global infrastructure & bot configuration files (`bot.json`, `emojis.json`). |
| `deploy/k8s/` | — | Kubernetes deployment manifests and KEDA scaling definitions. |
| `scripts/` | — | Build, manifest generation, addon validation, and chaos testing scripts. |

---

## ❓ FAQ & Support

<details>
<summary><b>Do third-party addons run in a sandbox?</b></summary>
<br>

> [!WARNING]
> No. Addons run in the same process space as Lumi with full access to tokens, database, and filesystem. Only install addons from sources you trust completely. Read [docs/security-and-privacy.md](docs/security-and-privacy.md) for details.
</details>

<details>
<summary><b>How do I contribute new features or modules?</b></summary>
<br>

Please read our **[CONTRIBUTING.md](CONTRIBUTING.md)** and **[docs/module-development.md](docs/module-development.md)** before submitting pull requests.
</details>

---

## ⚖️ License & Trademark

Lumi is licensed under the **GNU AGPL v3.0 License**. See the [LICENSE](LICENSE) file for details.

> [!IMPORTANT]
> **Trademark Notice**: The "Lumi" name, branding, and mascot are reserved. If you host a public instance or fork this repository, you **MUST** rename your bot and use your own branding.

---

<div align="center">
  Made with ❤️ by the Lumi Project Contributors.<br>
  Review <a href="CONTRIBUTING.md">CONTRIBUTING.md</a> and <a href="docs/architecture.md">Architecture Guide</a> before getting started.
</div>
