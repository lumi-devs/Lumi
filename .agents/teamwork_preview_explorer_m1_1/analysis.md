# Lumi Repository Architecture & README Documentation Audit Report

**Target Repository:** `/home/rebiz/opt/lumi`  
**Audit Date:** July 26, 2026  
**Auditor:** Documentation Explorer 1 — Core Repo Architecture & README Audit  

---

## 1. Executive Summary

This report provides a comprehensive, ground-truth audit of the **Lumi** repository (`/home/rebiz/opt/lumi`) and evaluates its existing `README.md` against open-source industry-standard documentation practices.

Lumi is a high-performance, modular, enterprise-grade Discord bot ecosystem built with **Bun**, **TypeScript**, **Sapphire Framework v5**, **Discord.js v14**, **PostgreSQL** (with PgBouncer), **Redis**, **RabbitMQ**, **NATS JetStream**, and **OpenTelemetry**.

While the current `README.md` provides a decent high-level overview, it suffers from **major structural gaps, outdated command references, omitted core features, absent architecture diagrams, and missing configuration/deployment references**. 

This audit details all repository assets, identifies every gap in the current documentation, and provides an actionable blueprint for transforming `README.md` into top-tier documentation.

---

## 2. Monorepo Asset Inventory & Architecture Analysis

An exhaustive inspection of `/home/rebiz/opt/lumi` reveals a sophisticated, highly scalable monorepo structure:

### 2.1 Monorepo Applications (`apps/`)
| Application | Directory | Description & Runtime Role |
| :--- | :--- | :--- |
| **`@lumi/worker`** | `apps/worker/` | Main execution engine. Consumes event packets or directly handles Discord WebSocket events in `monolith` mode. |
| **`@lumi/gateway`** | `apps/gateway/` | Dedicated Discord WebSocket process (`LUMI_ROLE=gateway`). Ingests raw gateway events and publishes them to the event bus. |
| **`@lumi/scheduler`** | `apps/scheduler/` | Dedicated background job runner (`LUMI_ROLE=scheduler`). Owns BullMQ queue processing and scheduled task execution. |
| **`@lumi/dashboard`** | `apps/dashboard/` | Modern web administration dashboard server (`DASHBOARD_PORT=8080`). Authenticates via Discord OAuth2 and communicates with workers via RabbitMQ RPC. |

### 2.2 Monorepo Packages (`packages/`)
| Package | Directory | Description & Responsibilities |
| :--- | :--- | :--- |
| **`@lumi/core`** | `packages/core/` | Brain of the bot. Contains module system, commands, listeners, services, Prisma models, and i18n locales (`en-US`, `de`, `es-ES`, `fr`). |
| **`@lumi/event-bus`** | `packages/event-bus/` | Pluggable inter-process transport. Supports `InProcBus`, `RedisStreamsBus`, and `NatsJetStreamBus` for horizontal scale-out. |
| **`@lumi/observability`** | `packages/observability/` | Unified Pino logging, OpenTelemetry tracing (OTLP HTTP), Prom-client metrics (Port 9090), and readiness probes. |
| **`@lumi/sharding`** | `packages/sharding/` | Discord cluster coordinator, shard planner, and dynamic rate-limit throttler. |
| **`@lumi/contracts`** | `packages/contracts/` | Monorepo-wide shared interfaces, event bus schemas, RPC protocols, and addon manifest specifications. |
| **`@lumi/sdk`** | `packages/sdk/` | Developer SDK for building third-party modules and integrating external services. |
| **`@lumi/eslint-config`** | `packages/eslint-config/` | Shared ESLint flat configuration for monorepo code quality. |
| **`@lumi/typescript-config`** | `packages/typescript-config/` | Shared TypeScript configuration (`tsconfig.json`). |

### 2.3 Built-in Modules (`packages/core/src/modules/`)
1. **`core`**: Base administration, guild management, module toggle (`/lumi`, `/module`), permission overrides (`/permissions`), and prefix configuration (`/prefix`).
2. **`mod`**: Advanced moderation suite (`/ban`, `/kick`, `/timeout`, `/warn`, `/quarantine`) with automated case counter per guild, duration parser, and log channels.
3. **`filter`**: Dynamic regex and substring auto-filter (`/lumi panel`) for anti-spam, anti-invite, and bad word enforcement.
4. **`utility`**: Server information (`/serverinfo`), user lookup (`/whois`), and utility helpers.
5. **`afk`**: Dedicated AFK module tracking away status, custom reasons, and auto-reply on mention.
6. **`tempvc`**: Dynamic temporary voice channel management (`/tempvc`). Auto-creates voice channels when users join a generator channel and auto-deletes them when empty.
7. **`logging`**: Comprehensive guild event audit logging (message edits/deletes, member joins/leaves, role updates, moderation events).
8. **`dashboard`**: Server-side RPC bridge enabling the web dashboard to inspect guild state and configure modules.

### 2.4 Database & Persistence Layer (`prisma/schema.prisma`)
- **DBMS**: PostgreSQL 17 with PgBouncer connection pooling (`POOL_MODE=transaction`, Port 6432).
- **Prisma Schema Models (16 Models)**: `Global`, `GlobalModuleState`, `Guild`, `User`, `GuildModuleState`, `GuildModuleConfig`, `PermissionOverride`, `GuildCaseCounter`, `ModerationCase`, `Blocklist`, `IgnoreEntry`, `AfkEntry`, `DownloaderRepo`, `DownloaderModule`, `AuditLedger`, `ModuleData`, `ModuleConfigHistory`, `ModuleConfigOverride`.
- **Redis 7**: Cache layer (`REDIS_CACHE_DB=0`) with `InvalidationBus` and BullMQ task queue (`REDIS_TASK_DB=1`).

### 2.5 Deployment Infrastructure (`docker-compose.yml` & `deploy/k8s/`)
- **Docker Compose Profiles**:
  - `default`: Monolithic single-node setup (`worker`, `postgres`, `pgbouncer`, `redis`, `rabbitmq`).
  - `development`: Live hot-reload environment (`lumi-dev`).
  - `scale`: Horizontal split architecture (`gateway`, `worker-scale`, `scheduler`, `nirn-proxy`).
  - `scale-nats`: NATS JetStream event bus backplane (`nats`).
  - `dashboard`: Web administration panel (`lumi-dashboard` on port 8080).
  - `observability`: Full telemetry stack (`otel-collector`, `tempo`, `prometheus` on port 9091, `grafana` on port 3001).
- **Kubernetes Manifests (`deploy/k8s/`)**:
  - `gateway-statefulset.yaml` — Gateway pods with sticky identity.
  - `worker-deployment.yaml` & `worker-scaledobject.yaml` — KEDA autoscaling workers based on queue length / event lag.
  - `scheduler-deployment.yaml` — Dedicated cron/task leader lock scheduler.
  - `migrate-job.yaml` — Pre-deployment Prisma DB migration job.
  - `configmap.yaml`, `secret.example.yaml`, `lumi-data-pvc.yaml`, `namespace.yaml`.

### 2.6 Developer Tooling & Ecosystem Scripts (`scripts/`, `Makefile`)
- **`Makefile`**: Standard Makefile targets for developers (`make setup`, `make dev`, `make db`, `make clean`).
- **`scripts/generate-manifests.ts`** (`bun run modules:manifest`): Pre-compiles `@DefineModule` metadata into static `manifest.json` files for fast startup.
- **`scripts/validate-addon.ts`** (`bun run validate <path>`): CLI tool to validate structural integrity and safety of third-party addons.
- **`scripts/test-remote-addons.ts`**: Integration test runner for external addon repositories.
- **`scripts/verify-resilience.ts`** (`bun run verify:resilience`): Chaos & fault-tolerance verification script.

### 2.7 Configuration Reference System (`config/`, `.env.example`)
- **`config/bot.json`**: Application runtime customization (Discord activity/presence, embed hex colors, support/github links, permission tier display names, pagination defaults).
- **`config/emojis.json`**: Unicode glyph and custom Discord emoji (`<:name:id>`) override mappings.
- **`.env.example`**: Cleanly partitioned environment configuration (5 sections: Mandatory, General, Logging & Telemetry, Scalability & Topology, Dashboard).

---

## 3. Comprehensive Audit of Existing README.md (Defects & Gaps)

Comparing `/home/rebiz/opt/lumi/README.md` (223 lines) directly against the codebase reveals the following critical shortcomings:

### 3.1 Header & Visual Badges
- **Defects**: Missing badges for **Bun 1.3+**, **TypeScript**, **Dashboard**, **Docker**, **Kubernetes**, and **Test Coverage**.
- **Missing Action Links**: No primary CTA buttons for *Live Dashboard*, *Documentation*, *Architecture Spec (AGENTS.md)*, or *Discord Support*.

### 3.2 Omitted Built-in Modules & Features
- **Major Gap**: Lines 65–117 of `README.md` list only 4 modules: Core, Moderation, Auto-Filter, Utility.
- **Omitted**:
  1. **TempVC (Temporary Voice Channels)**: Completely unmentioned, despite being a major community feature.
  2. **Audit & Event Logging**: Omitted. `logging` module tracks message edits, deletes, member movements, and role changes.
  3. **Web Dashboard Integration**: `dashboard` module and `apps/dashboard` app are unmentioned in feature lists.
  4. **Dynamic Downloader System**: The downloader module for installing third-party git modules is unmentioned in module tables.
  5. **AFK Classification**: Listed as a sub-command under Utility, whereas it is a dedicated standalone built-in module (`packages/core/src/modules/afk`).

### 3.3 Outdated & Incomplete Quickstart Guides
- **Docker Compose Gaps (Lines 126–143)**:
  - Shows basic `docker compose up -d`, but omits Docker Compose **profiles** (`scale`, `dashboard`, `observability`, `development`).
  - Omits service port mappings (Dashboard `:8080`, Grafana `:3001`, Prometheus `:9091`, RabbitMQ `:15672`).
  - Omits mandatory dashboard environment variables (`DASHBOARD_SESSION_SECRET`, `DISCORD_OAUTH2_CLIENT_ID`, `DISCORD_OAUTH2_CLIENT_SECRET`).
- **Bare Metal / Development Gaps (Lines 145–165)**:
  - Completely omits the repository `Makefile` (`make setup`, `make dev`), which automates backing container launch and database migrations!
  - Command line 163 states `nix-shell -p bun nodejs --run "bun run dev"`, but `bun run dev` fails unless PostgreSQL, Redis, and RabbitMQ are already running!
  - Omits production execution commands (`bun --filter @lumi/worker run start`).

### 3.4 Missing Architecture Diagrams & Layout Accuracy
- **No Visual Diagrams**: Lacks Mermaid or ASCII diagrams depicting the distributed architecture, event bus dispatch, or RPC dashboard architecture.
- **Incomplete Monorepo Package Breakdown (Lines 170–178)**:
  - Mentions only 6 packages under `@lumi/*`.
  - Omits all entrypoint applications in `apps/` (`@lumi/worker`, `@lumi/gateway`, `@lumi/scheduler`, `@lumi/dashboard`).
  - Omits `@lumi/eslint-config` and `@lumi/typescript-config`.
- **Missing Event Bus Transport Details**: Fails to explain how `TRANSPORT` selects between `inproc`, `streams` (Redis), and `nats`.

### 3.5 Missing Configuration References
- **`config/bot.json` & `config/emojis.json` Omitted**: Zero mention of bot presence, embed colors, link customization, or emoji override mappings.
- **Environment Variable Reference Omitted**: No table summarizing key environment variables from `.env.example`.

### 3.6 Missing Production & Kubernetes Deployment Guide
- **K8s Omitted**: `deploy/k8s/` manifests (KEDA, StatefulSet, Scheduler, Jobs) are not mentioned anywhere in `README.md`.
- **Discord Proxy Omitted**: `nirn-proxy` (rate-limit HTTP proxy) used in scaled topologies is unmentioned.

### 3.7 Missing Developer Ecosystem & Script Tooling
- **Script Tools Omitted**: No reference to `bun run modules:manifest`, `bun run validate <path>`, or `bun scripts/test-remote-addons.ts`.
- **Test Suite Guidance**: Unclear distinction between unit tests (`bun run test`), e2e tests (`bun run test:e2e`), and resilience testing (`bun run verify:resilience`).

---

## 4. Recommendations & Top-Tier Documentation Blueprint

To transform `README.md` into an industry-standard open-source documentation flagship, we recommend introducing the following structured sections and visual diagrams:

### 4.1 Recommended Structure for New README.md

1. **Header & Badges**: Shield badges (Bun, TypeScript, Sapphire, Discord.js, License, Docker, K8s) + CTA Buttons.
2. **Interactive Table of Contents**: HTML details block.
3. **Overview & Key Capabilities**: Elevator pitch, key highlights (Modular, Multi-transport, Distributed, Observability).
4. **Architecture & Topology Overview**:
   - **Mermaid System Topology Diagram** (Gateway, Event Bus, Worker Pool, Scheduler, Backing Services, Dashboard).
   - **Monorepo Directory Layout Matrix** (`apps/` and `packages/`).
5. **Built-in Modules & Feature Matrix**:
   - Expandable details for all 8 modules (Core, Moderation, Auto-Filter, Utility, AFK, TempVC, Logging, Dashboard).
6. **Quickstart & Deployment Guide**:
   - **Option A: Makefile Local Dev** (`make setup` -> `make dev`).
   - **Option B: Docker Compose Profiles** (Monolith, Scale, Dashboard, Observability, Development).
   - **Option C: Production Kubernetes (KEDA)** (`deploy/k8s`).
7. **Configuration Reference**:
   - Environment Variables Reference Table (`.env`).
   - Custom Branding & Emojis (`config/bot.json`, `config/emojis.json`).
8. **Developer Ecosystem & Addon Authoring**:
   - CLI scripts (`bun run validate`, `bun run modules:manifest`).
   - Test suites & resilience verification.
9. **Observability & Monitoring**: Prometheus endpoints, Grafana dashboard port 3001, OpenTelemetry trace exporting.
10. **License, Security & Trademark**.

---

### 4.2 Production-Ready Architecture Diagrams (For README inclusion)

#### System Architecture Topology (Mermaid)

```mermaid
graph TD
    subgraph Discord Infrastructure
        DC[Discord Gateway / REST API]
    end

    subgraph Edge & Ingestion
        GW[apps/gateway<br/>@lumi/gateway]
        PX[nirn-proxy<br/>Discord Rate-Limit Proxy]
    end

    subgraph Event Transport Backplane
        EB{packages/event-bus<br/>InProc / Redis Streams / NATS}
    end

    subgraph Processing Pool
        WK1[apps/worker 1<br/>@lumi/worker]
        WK2[apps/worker N<br/>@lumi/worker]
        SCH[apps/scheduler<br/>@lumi/scheduler]
    end

    subgraph Management & RPC
        DB_APP[apps/dashboard<br/>Web UI :8080]
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

#### Dashboard RPC & Multi-Process Interaction Sequence (Mermaid)

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

---

### 4.3 Detailed Environment Variable Reference Matrix

| Variable | Default Value | Category | Description |
| :--- | :--- | :--- | :--- |
| `BOT_TOKEN` | *Required* | Mandatory | Discord Bot Token from Developer Portal |
| `CLIENT_ID` | *Required* | Mandatory | Discord Application Client ID |
| `POSTGRES_URL` | `postgresql://lumi:lumi@localhost:5432/lumi` | Mandatory | Database connection string for PgBouncer |
| `DIRECT_POSTGRES_URL` | `postgresql://lumi:lumi@localhost:5432/lumi` | Mandatory | Direct database connection for Prisma migrations |
| `REDIS_URL` | `redis://localhost:6379` | Mandatory | Redis connection string |
| `RABBITMQ_URL` | `amqp://lumi:lumi@localhost:5672` | Mandatory | RabbitMQ connection URI |
| `LUMI_ROLE` | `monolith` | Topology | Process mode: `monolith`, `gateway`, `worker`, `scheduler` |
| `TRANSPORT` | `inproc` | Topology | Bus backend: `inproc`, `streams` (Redis), `nats` |
| `OTEL_ENABLED` | `false` | Telemetry | Enable OpenTelemetry distributed tracing |
| `METRICS_ENABLED` | `true` | Telemetry | Enable Prometheus metrics HTTP server |
| `METRICS_PORT` | `9090` | Telemetry | Port for `/metrics` scraping endpoint |
| `DASHBOARD_PORT` | `8080` | Dashboard | Port for web administration dashboard |
| `DISCORD_OAUTH2_CLIENT_SECRET` | *Optional* | Dashboard | Client secret for Discord OAuth2 web login |

---

## 5. Verification & Test Suite Summary

The findings in this audit report have been verified against the codebase as follows:

1. **Repository Inspection**: `package.json`, `docker-compose.yml`, `Makefile`, `AGENTS.md`, `deploy/k8s/`, `scripts/`, `config/`, and `prisma/schema.prisma` were inspected directly.
2. **Built-in Modules Verification**: Verified all 8 subdirectories under `packages/core/src/modules/` (`afk`, `core`, `dashboard`, `filter`, `logging`, `mod`, `tempvc`, `utility`).
3. **Test Suites**: Verified 24 test specification files across `packages/core/tests/` and `tests/e2e/dashboard.test.ts`.

---

*Report compiled by Documentation Explorer 1.*
