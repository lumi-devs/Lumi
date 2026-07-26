<div align="center">
  <br />
  <img src="assets/banner.png" alt="Lumi Mascot Banner" width="800" style="border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
  <br />
  
  <h1>✨ Lumi</h1>
  
  <p><b>Enterprise-Grade, Modular, Distributed Discord Bot Ecosystem & Web Dashboard</b></p>

  <div align="center">
    <a href="https://bun.sh"><img src="https://img.shields.io/badge/Bun-1.3+-black?style=for-the-badge&logo=bun" alt="Bun"></a>
    <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.9-blue?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript"></a>
    <a href="https://sapphirejs.dev"><img src="https://img.shields.io/badge/Sapphire-v5-blue?style=for-the-badge" alt="Sapphire"></a>
    <a href="https://discord.js.org"><img src="https://img.shields.io/badge/Discord.js-v14-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Discord.js"></a>
    <a href="https://www.docker.com/"><img src="https://img.shields.io/badge/Docker-Supported-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker"></a>
    <a href="https://kubernetes.io/"><img src="https://img.shields.io/badge/Kubernetes-KEDA-326CE5?style=for-the-badge&logo=kubernetes&logoColor=white" alt="Kubernetes"></a>
    <a href="https://github.com/lumi-devs/lumi/discussions"><img src="https://img.shields.io/badge/Discussions-Enabled-brightgreen?style=for-the-badge&logo=github" alt="GitHub Discussions"></a>
    <img src="https://img.shields.io/badge/License-AGPL%20v3.0-green?style=for-the-badge" alt="License">
  </div>
  <br />

  <p>
    <a href="#-getting-started"><b>Quickstart Guide</b></a> &nbsp;&bull;&nbsp;
    <a href="#-built-in-modules--feature-matrix"><b>Feature Matrix</b></a> &nbsp;&bull;&nbsp;
    <a href="#-architecture--system-topology"><b>Architecture Topology</b></a> &nbsp;&bull;&nbsp;
    <a href="AGENTS.md"><b>AI Operating Specs (AGENTS.md)</b></a> &nbsp;&bull;&nbsp;
    <a href="#-configuration-reference"><b>Configuration Specs</b></a>
  </p>
</div>

<details open>
  <summary><b>📖 Table of Contents</b></summary>
  <ol>
    <li><a href="#-introduction">Introduction</a></li>
    <li><a href="#-key-capabilities">Key Capabilities</a></li>
    <li><a href="#-architecture--system-topology">Architecture & System Topology</a></li>
    <li><a href="#-built-in-modules--feature-matrix">Built-in Modules & Feature Matrix</a></li>
    <li><a href="#-getting-started">Getting Started</a></li>
    <li><a href="#-configuration-reference">Configuration Reference</a></li>
    <li><a href="#-developer-ecosystem--verification">Developer Ecosystem & Verification</a></li>
    <li><a href="#-observability--monitoring">Observability & Monitoring</a></li>
    <li><a href="#-faq--support">FAQ & Support</a></li>
    <li><a href="#-license--trademark">License & Trademark</a></li>
  </ol>
</details>

---

## 🌟 Introduction

**Lumi** is a high-performance, modular, enterprise-grade Discord bot ecosystem built from the ground up for modern communities and massive server fleets. Inspired by the extreme flexibility of modular bot architectures, Lumi enables server administrators to toggle features dynamically per-guild while offering developers a scalable, decoupled, multi-process monorepo runtime.

Powered by **Bun 1.3+**, **TypeScript 5.9**, **Sapphire Framework v5**, **Discord.js v14**, **PostgreSQL 17** (via PgBouncer), **Redis 7**, **RabbitMQ**, **NATS JetStream**, and **OpenTelemetry**, Lumi seamlessly transitions from a single-node monolithic container to a horizontally auto-scaled distributed cluster handling millions of events.

---

## ✨ Key Capabilities

- **🧩 Dynamic Module Architecture**  
  Features are strictly encapsulated into isolated built-in modules (`afk`, `core`, `dashboard`, `filter`, `logging`, `mod`, `tempvc`, `utility`). Modules can be enabled, disabled, or configured per-guild at runtime without process restarts.

- **📈 Distributed Event-Driven Topology**  
  Decouple ingestion from processing. Deploy standalone `Gateway` processes to receive raw Discord WebSockets, stream events over Redis Streams or NATS JetStream, and scale worker pools dynamically using Kubernetes & KEDA.

- **🖥️ Web Administration Dashboard**  
  A modern, dedicated Next/Bun administration web interface (`apps/dashboard` on `:8080`) backed by Discord OAuth2 authentication and non-blocking RabbitMQ RPC worker communication.

- **🔌 Third-Party Addon Engine**  
  Extend Lumi through dynamic third-party git modules. The built-in downloader module pulls and symlinks external addons safely into the module store with pre-flight verification scripts (`bun run validate <path>`).

- **🗣️ Multi-Lingual i18n Engine**  
  Full per-server localization with native support for `en-US`, `de`, `es-ES`, and `fr`, backed by typed i18next translation bundles.

- **📊 Comprehensive Telemetry & Observability**  
  Native OpenTelemetry tracing (OTLP HTTP), Prometheus metrics endpoint (`:9090`), and ready-to-use Grafana dashboards (`:3001`) with structured Pino logging.

---

## 🏗️ Architecture & System Topology

Lumi is organized as a unified Bun workspace monorepo separating entrypoint applications (`apps/`) from reusable core packages (`packages/`).

### System Topology Diagram

```mermaid
graph TD
    subgraph Discord Infrastructure
        DC[Discord Gateway / REST API]
    end

    subgraph Edge & Ingestion
        GW[apps/gateway<br/>LUMI_ROLE=gateway]
        PX[nirn-proxy<br/>Discord Rate-Limit Proxy]
    end

    subgraph Event Transport Backplane
        EB{packages/event-bus<br/>InProc / Redis Streams / NATS JetStream}
    end

    subgraph Processing Pool
        WK1[apps/worker 1<br/>LUMI_ROLE=worker]
        WK2[apps/worker N<br/>LUMI_ROLE=worker]
        SCH[apps/scheduler<br/>LUMI_ROLE=scheduler]
    end

    subgraph Management & Web RPC
        DB_APP[apps/dashboard<br/>Web Admin UI :8080]
        MQ[(RabbitMQ<br/>RPC & Events)]
    end

    subgraph Datastores & Cache
        PG[(PostgreSQL 17)]
        PGB[PgBouncer :6432]
        RD[(Redis 7<br/>Cache & BullMQ)]
    end

    DC <-->|WebSocket| GW
    GW -->|Publish Raw Dispatch| EB
    EB -->|Consume Events| WK1
    EB -->|Consume Events| WK2
    
    WK1 <-->|REST Requests| PX
    WK2 <-->|REST Requests| PX
    PX <-->|Proxied REST| DC
    
    SCH <-->|BullMQ Tasks| RD
    
    WK1 -->|Transaction Pool| PGB
    WK2 -->|Transaction Pool| PGB
    PGB --> PG
    WK1 <-->|State & Invalidation| RD
    WK2 <-->|State & Invalidation| RD

    DB_APP <-->|RPC Commands| MQ
    MQ <-->|RPC Handler| WK1
```

### Dashboard RPC Interaction Sequence

```mermaid
sequenceDiagram
    autonumber
    actor Admin as Server Administrator
    participant DB as apps/dashboard (HTTP :8080)
    participant RMQ as RabbitMQ (RPC Queue)
    participant WK as apps/worker (@lumi/core)
    participant PG as PostgreSQL (PgBouncer)
    participant RD as Redis (Cache)

    Admin->>DB: Update Guild Module Config (/dashboard)
    DB->>RMQ: Publish RPC Request (UpdateConfigPayload)
    RMQ->>WK: Deliver RPC Message to Worker
    WK->>PG: Persist GuildModuleConfig (Prisma)
    WK->>RD: Invalidate Guild Config Cache (InvalidationBus)
    WK-->>RMQ: Publish RPC Success Response
    RMQ-->>DB: Receive RPC Ack & Data
    DB-->>Admin: Render 200 OK Response
```

### Monorepo Structure

| Category | Package / Directory | Purpose & Runtime Responsibilities |
| :--- | :--- | :--- |
| **Apps** | `apps/worker/` (`@lumi/worker`) | Main execution engine for command handling, events, and module business logic. |
| | `apps/gateway/` (`@lumi/gateway`) | Dedicated Discord WebSocket worker process (`LUMI_ROLE=gateway`). Publishes raw dispatch events to transport bus. |
| | `apps/scheduler/` (`@lumi/scheduler`) | Dedicated background task scheduler (`LUMI_ROLE=scheduler`) managing BullMQ queues and delayed jobs. |
| | `apps/dashboard/` (`@lumi/dashboard`) | Next/Bun web administration panel (`:8080`) with Discord OAuth2 and RPC messaging. |
| **Packages**| `@lumi/core` (`packages/core/`) | Core bot framework, module sub-stores, services, Prisma models, and i18n locales. |
| | `@lumi/event-bus` (`packages/event-bus/`) | Transport abstraction (`InProcBus`, `RedisStreamsBus`, `NatsJetStreamBus`). |
| | `@lumi/observability` (`packages/observability/`) | Pino logger, OpenTelemetry exporter, Prometheus metrics server (`:9090`). |
| | `@lumi/sharding` (`packages/sharding/`) | Discord cluster coordinator, shard planner, and dynamic rate-limit throttler. |
| | `@lumi/contracts` (`packages/contracts/`) | Shared TypeScript interfaces, event schemas, RPC contract definitions, and addon manifests. |
| | `@lumi/sdk` (`packages/sdk/`) | Developer SDK for building external Lumi extensions and third-party modules. |
| | `@lumi/eslint-config` (`packages/eslint-config/`) | Shared ESLint flat configurations across all monorepo packages. |
| | `@lumi/typescript-config` (`packages/typescript-config/`) | Shared tsconfig presets (`tsconfig.json`). |

---

## ⚡ Built-in Modules & Feature Matrix

Lumi ships with 8 built-in modules located in `packages/core/src/modules/`. Each module is strictly isolated and managed via `@DefineModule`.

| Icon | Module ID | Name | Primary Commands / Interfaces | Key Features & Capabilities |
| :---: | :--- | :--- | :--- | :--- |
| ⚙️ | `core` | Core Settings | `/lumi`, `/module`, `/permissions`, `/prefix` | Base bot settings, module toggle system, per-guild prefix configuration, and role/permission tier overrides. |
| 🔨 | `mod` | Advanced Moderation | `/ban`, `/kick`, `/timeout`, `/warn`, `/quarantine` | Moderation action suite with automated case ID generation, duration parsing, user history, and log channel delivery. |
| 🛡️ | `filter` | Dynamic Auto-Filter | `/lumi panel` | Real-time automated message inspection using regex pattern matching and substring matching for anti-spam, anti-invite, and bad words. |
| 🔧 | `utility` | Guild Utilities | `/serverinfo`, `/whois` | Rich server information lookup, detailed user profile inspection, avatar retrieval, and guild diagnostic statistics. |
| 💤 | `afk` | AFK Manager | `/afk` | Set away-from-keyboard status with custom reasons; automatically notifies callers on mention and clears status upon return. |
| 🎙️ | `tempvc` | Dynamic TempVC | `/tempvc` | Auto-creates dynamic temporary voice channels when users join a designated generator channel; auto-deletes when empty. |
| 📜 | `logging` | Guild Audit Logging | Guild Events Listener | Comprehensive audit logging for message updates, message deletes, member joins/leaves, role changes, and moderation actions. |
| 🖥️ | `dashboard` | Dashboard RPC Bridge | Web RPC Handler | Internal backend bridge enabling the web dashboard (`apps/dashboard`) to query guild state and apply configuration changes. |

---

## 🚀 Getting Started

Lumi supports local development via standard `Makefile` workflows, multi-container deployments with Docker Compose profiles, and enterprise cloud hosting via Kubernetes & KEDA.

> [!PREREQUISITES]
> Ensure you have **Bun 1.3+**, **Docker**, and **PostgreSQL 17** / **Redis 7** / **RabbitMQ** installed or running via containers.

### Method 1: Makefile Local Development (Recommended)

Lumi includes a root `Makefile` to streamline local setup, containerized backing services, database migrations, and hot-reloading dev servers.

```bash
# 1. Clone the repository and configure environment variables
git clone https://github.com/lumi-devs/lumi.git && cd lumi
cp .env.example .env

# Edit .env to set your BOT_TOKEN and CLIENT_ID
nano .env

# 2. Run automated setup (Installs dependencies, starts Postgres/Redis/RabbitMQ, pushes Prisma schema)
make setup

# 3. Launch dev environment with Turbo hot-reloading
make dev

# Additional Makefile Targets:
make db      # Start only backing Docker services (Postgres, PgBouncer, Redis, RabbitMQ)
make clean   # Stop backing Docker containers and purge volumes
```

### Method 2: Docker Compose Profiles

Lumi uses Docker Compose **profiles** to launch specific runtime configurations tailored to your environment:

```bash
# Profile A: Default Monolith Stack (Worker + Postgres + PgBouncer + Redis + RabbitMQ)
docker compose --profile default up -d

# Profile B: Scale-out Distributed Architecture (Gateway + Worker Pool + Scheduler + Rate-Limit Proxy)
docker compose --profile scale up -d

# Profile C: NATS JetStream Event Bus
docker compose --profile scale-nats up -d

# Profile D: Web Administration Dashboard (:8080)
docker compose --profile dashboard up -d

# Profile E: Observability Stack (OTel Collector + Prometheus :9091 + Grafana :3001 + Tempo)
docker compose --profile observability up -d

# Launch all production components together:
docker compose --profile scale --profile dashboard --profile observability up -d
```

### Method 3: Production Kubernetes Deployment (KEDA)

Production manifests are located in `deploy/k8s/`:

```bash
# 1. Apply namespace, configurations, and secrets
kubectl apply -f deploy/k8s/namespace.yaml
kubectl apply -f deploy/k8s/configmap.yaml
kubectl apply -f deploy/k8s/secret.example.yaml

# 2. Run Prisma database migration job
kubectl apply -f deploy/k8s/migrate-job.yaml

# 3. Deploy Gateway StatefulSet, Worker Deployment, KEDA ScaledObject, and Scheduler
kubectl apply -f deploy/k8s/gateway-statefulset.yaml
kubectl apply -f deploy/k8s/worker-deployment.yaml
kubectl apply -f deploy/k8s/worker-scaledobject.yaml
kubectl apply -f deploy/k8s/scheduler-deployment.yaml
```

---

## ⚙️ Configuration Reference

### Environment Variables Matrix (`.env.example`)

| Variable | Default Value | Category | Description |
| :--- | :--- | :--- | :--- |
| `BOT_TOKEN` | *Required* | Mandatory | Discord Bot Token from Developer Portal |
| `CLIENT_ID` | *Required* | Mandatory | Discord Application Client ID |
| `POSTGRES_URL` | `postgresql://lumi:lumi@localhost:5432/lumi` | Mandatory | PgBouncer database pool connection URI |
| `DIRECT_POSTGRES_URL` | `postgresql://lumi:lumi@localhost:5432/lumi` | Mandatory | Direct database connection URI for Prisma migrations |
| `REDIS_URL` | `redis://localhost:6379` | Mandatory | Redis 7 connection string |
| `RABBITMQ_URL` | `amqp://lumi:lumi@localhost:5672` | Mandatory | RabbitMQ connection URI for RPC and event fanout |
| `LUMI_ROLE` | `monolith` | Topology | Execution mode: `monolith`, `gateway`, `worker`, `scheduler` |
| `TRANSPORT` | `inproc` | Topology | Event bus transport: `inproc`, `streams` (Redis), `nats` |
| `OTEL_ENABLED` | `false` | Telemetry | Toggle OpenTelemetry distributed tracing |
| `METRICS_ENABLED` | `true` | Telemetry | Enable Prometheus metrics exporter |
| `METRICS_PORT` | `9090` | Telemetry | Port for Prometheus `/metrics` endpoint |
| `DASHBOARD_PORT` | `8080` | Dashboard | HTTP port for web administration panel |
| `DISCORD_OAUTH2_CLIENT_SECRET` | *Optional* | Dashboard | Discord OAuth2 Client Secret for web admin login |

### Application Branding & Emojis (`config/`)

- **`config/bot.json`**: Application runtime customization (Discord activity/presence, embed hex color themes, support/github URLs, permission tier labels, pagination limits).
- **`config/emojis.json`**: Unicode glyph and custom Discord emoji (`<:name:id>`) override mappings used by the card rendering system.

---

## 🛠️ Developer Ecosystem & Verification

Lumi provides comprehensive developer CLI tooling for testing, validation, and addon management:

```bash
# 1. Generate Prisma Client Types
bun run db:generate

# 2. Compile Module Metadata & Static Manifests
bun run modules:manifest

# 3. Execute Full Workspace Typecheck
bun run typecheck

# 4. Execute Code Quality & ESLint Suite
bun run lint

# 5. Run Unit & Integration Test Suites
bun run test

# 6. Run End-to-End Test Suite
bun run test:e2e

# 7. Run System Resilience & Chaos Verification
bun run verify:resilience

# 8. Validate Third-Party Addon Package Structure
bun run validate <path/to/addon>
```

> [!NOTE]
> If running in a Nix environment without global Bun on path, prefix commands with `nix-shell -p bun nodejs --run "..."`.

---

## 📊 Observability & Monitoring

Lumi exposes production metrics and OpenTelemetry trace signals out of the box:

- **Prometheus Metrics**: Available on port `:9090` (`http://localhost:9090/metrics`). Tracks active WebSocket shards, command execution counters, queue latencies, database query durations, and memory heap statistics.
- **Grafana Dashboards**: Included in the `observability` Compose profile on port `:3001` (`admin`/`admin`). Pre-configured with panel visualization for event bus throughput and worker lag.
- **OpenTelemetry Tracing**: Set `OTEL_ENABLED=true` to export OTLP HTTP traces to collector on `:4318` (viewable via Grafana Tempo).

---

## ❓ FAQ & Support

<details>
<summary><b>Do third-party addons run in a sandbox?</b></summary>
<br>

> [!WARNING]
> No. Third-party addons installed into Lumi have **NO strict VM sandbox**. They execute directly within the Node/Bun process space and possess full access to database connections, Redis, and Discord API credentials. **Only install addons from sources you trust completely.** Validate addons beforehand using `bun run validate <path>`.

</details>

<details>
<summary><b>How does horizontal worker autoscaling work?</b></summary>
<br>

When running under `LUMI_ROLE=worker` with `TRANSPORT=streams` or `nats`, worker nodes consume raw event packets off the event bus. Kubernetes KEDA monitors event queue depth and dynamically scales worker deployment replicas up or down based on load.

</details>

<details>
<summary><b>Where can I report bugs or seek help?</b></summary>
<br>

Join our community discussions on [GitHub Discussions](https://github.com/lumi-devs/lumi/discussions) or submit bug reports on [GitHub Issues](https://github.com/lumi-devs/lumi/issues).

</details>

---

## ⚖️ License & Trademark

Lumi is licensed under the **GNU AGPL v3.0 License**. See the [LICENSE](LICENSE) file for complete details.

> [!IMPORTANT]
> **Trademark Notice**: The "Lumi" name, logo, branding, and mascot are reserved assets. If you fork, modify, or host your own public instance of this software, you **MUST** rebrand your instance and use unique logos and names to prevent misleading end-users.

---

<div align="center">
  Made with ❤️ by the Lumi Project Contributors.<br>
  Please read <a href="AGENTS.md">AGENTS.md</a> for AI agent guidelines and architecture specs before contributing.
</div>
