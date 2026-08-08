# 🐳 Lumi Docker & Container Deployment

<div align="center">
  <img src="https://img.shields.io/badge/Docker-24.0+-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker">
  <img src="https://img.shields.io/badge/Docker_Compose-v2.20+-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker Compose">
  <img src="https://img.shields.io/badge/Base_Image-oven%2Fbun%3A1--alpine-black?style=for-the-badge&logo=bun" alt="Bun Alpine">
  <img src="https://img.shields.io/badge/Status-Production_Ready-brightgreen?style=for-the-badge" alt="Status">
</div>

<br />

This directory documents the containerization strategy, **Dockerfile multi-stage build system**, and **Docker Compose topology** for running Lumi in single-node development, multi-service scaled production, or observability-enabled environments.

---

## 📖 Table of Contents

- [Overview & Container Architecture](#-overview--container-architecture)
- [Dockerfile Multi-Stage Target Pipeline](#-dockerfile-multi-stage-target-pipeline)
- [Docker Compose Services & Profiles](#-docker-compose-services--profiles)
- [Configuration & Environment Variables](#-configuration--environment-variables)
- [Execution & Operation Commands](#-execution--operation-commands)
- [Observability Stack Setup](#-observability-stack-setup)

---

## 🌟 Overview & Container Architecture

Lumi's container setup provides complete flexibility: run a single bot container against the core data plane, or launch a fully orchestrated stack with extra worker replicas, a dashboard, and OpenTelemetry tracing.

There are two application roles. A **worker** owns its own Discord WebSocket connection and runs all command, module, and interaction logic in-process; a **scheduler** owns BullMQ queues and holds no WebSocket. There is no separate gateway container. A single worker tracks its own Discord REST rate-limit buckets; once you run more than one, the `scale` profile adds **nirn-proxy** as a shared REST proxy so those buckets stay coordinated across processes (`DISCORD_PROXY_URL`).

### Docker Compose Architecture Diagram

```mermaid
flowchart TD
    subgraph External
        Discord[Discord Gateway / REST API]
    end

    subgraph Edge Services
        NP[lumi-nirn-proxy<br/>Profile: scale<br/>:18080 / :19000]
        Dash[lumi-dashboard<br/>Profile: dashboard]
    end

    subgraph Lumi Application Nodes
        W[lumi-worker<br/>Default]
        WS[lumi-worker-scale<br/>Profile: scale]
        Sched[lumi-scheduler<br/>Profile: scale]
        Dev[lumi-dev<br/>Profile: development]
    end

    subgraph Data & Messaging Plane
        PGB[lumi-pgbouncer<br/>:6432]
        PG[(lumi-postgres<br/>PostgreSQL 17)]
        Redis[(lumi-redis<br/>Redis 7)]
        RMQ[(lumi-rabbitmq<br/>RabbitMQ 4 Management)]
    end

    subgraph Telemetry & Observability Stack
        OTEL[lumi-otel-collector<br/>:4318]
        Prom[lumi-prometheus<br/>:9091]
        Tempo[lumi-tempo]
        Graf[lumi-grafana<br/>:3001]
    end

    Discord <-->|WebSocket| W
    Discord <-->|WebSocket| WS
    W -->|REST| Discord
    NP -->|REST| Discord

    W -.->|REST via DISCORD_PROXY_URL<br/>scale only| NP
    WS -.->|REST via DISCORD_PROXY_URL<br/>scale only| NP

    W <-->|Shard coordination / sessions| Redis
    WS <-->|Shard coordination / sessions| Redis
    W <-->|PgBouncer Pool| PGB
    PGB <-->|Scram-SHA-256| PG

    Dash <-->|RPC Messages| RMQ
    W <-->|RPC Responders| RMQ

    Sched <-->|BullMQ Tasks| Redis

    W -->|OTLP Traces / Metrics| OTEL
    WS -->|OTLP Traces / Metrics| OTEL
    OTEL -->|Traces| Tempo
    Prom -->|Scrape Metrics| W
    Prom -->|Scrape Metrics| WS
    Graf -->|Dashboards| Prom
    Graf -->|Dashboards| Tempo
```

---

## 🏗️ Dockerfile Multi-Stage Target Pipeline

The root [`Dockerfile`](../../Dockerfile) uses a 3-stage optimization pipeline based on `oven/bun:1-alpine`:

```mermaid
graph LR
    base[base<br/>oven/bun:1-alpine] --> builder[builder<br/>Install workspace & generate Prisma]
    builder --> runner[runner<br/>Optimized runtime image]
```

### Stage Summary

1. **`base`**: Installs minimal Alpine utilities (`git`, `dumb-init`).
2. **`builder`**: Copies workspace `package.json` files, source code, and Prisma schema; executes `bun install` + `bunx prisma generate`.
3. **`runner`**: Copies built dependencies including the full `prisma/` directory and `prisma.config.ts`, mounts `/app/data` for addons, switches to unprivileged user `bun`, and executes production main targets.

---

## 📑 Docker Compose Services & Profiles

Services are organized into distinct Compose **profiles** so you only run what you need.

| Service Name | Profile | Ports / Interfaces | Description |
|---|---|---|---|
| `worker` | *(default)* | - | Default Lumi bot process (`LUMI_ROLE=worker`). Owns the Discord WebSocket and runs all command, module, and interaction logic. |
| `lumi-dev` | `development` | - | Interactive development container with live volume mounts and watch mode. |
| `worker-scale` | `scale` | - | Additional worker replica (`LUMI_ROLE=worker`) claiming its own shard range. |
| `scheduler` | `scale` | - | Task Scheduler managing BullMQ background tasks (`LUMI_ROLE=scheduler`, no WebSocket). |
| `dashboard` | `dashboard` | `8080:8080` | Web Administration Dashboard UI. **Not working yet** - see the note under [Execution & Operation Commands](#-execution--operation-commands). |
| `postgres` | *(core)* | `127.0.0.1:5432:5432` | PostgreSQL 17 primary database server. |
| `pgbouncer` | *(core)* | `127.0.0.1:6432:6432` | PgBouncer transaction-level connection pooler. |
| `redis` | *(core)* | `127.0.0.1:6379:6379` | Redis 7 data store for entity caching and event streams. |
| `rabbitmq` | *(core)* | `127.0.0.1:5672`, `:15672` | RabbitMQ 4 broker with Management UI. |
| `nirn-proxy` | `scale` | `127.0.0.1:18080`, `:19000` | Shared Discord REST rate-limiting proxy for multi-worker runs. |
| `otel-collector` | `observability` | `127.0.0.1:4318:4318` | OpenTelemetry Collector endpoint (OTLP HTTP). |
| `prometheus` | `observability` | `127.0.0.1:9091:9090` | Prometheus metrics collector and alerting engine. |
| `tempo` | `observability` | - | Grafana Tempo distributed tracing storage engine. |
| `grafana` | `observability` | `127.0.0.1:3001:3000` | Grafana metrics and trace visualization dashboard. |

---

## ⚙️ Configuration & Environment Variables

Copy `.env.example` to `.env` in the project root before launching Docker containers:

```bash
cp .env.example .env
```

### Core Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `BOT_TOKEN` | - | Discord Bot Token (Required). |
| `POSTGRES_USER` | `lumi` | PostgreSQL database username. |
| `POSTGRES_PASSWORD` | `lumi` | PostgreSQL database password. |
| `REDIS_PASSWORD` | `lumi` | Redis password authentication. |
| `RABBITMQ_USER` | `lumi` | RabbitMQ username. |
| `RABBITMQ_PASSWORD` | `lumi` | RabbitMQ password. |
| `DASHBOARD_SESSION_SECRET` | - | NextAuth session JWT signing/encryption secret. |
| `DISCORD_OAUTH2_CLIENT_ID` | - | OAuth2 Client ID for dashboard authentication. |
| `DISCORD_OAUTH2_CLIENT_SECRET` | - | OAuth2 Client Secret for dashboard authentication. |
| `AUTH_URL` | *(derived)* | Dashboard's externally visible origin. Only needed behind a proxy that rewrites the Host header. |
| `DISCORD_PROXY_URL` | *(empty)* | Shared Discord REST proxy endpoint. Set to `http://nirn-proxy:8080` under the `scale` profile; leave empty for single-worker runs. |
| `OTEL_ENABLED` | `true` | Enables OpenTelemetry tracing exporters. |
| `GRAFANA_PASSWORD` | `admin` | Admin password for Grafana web UI. |

---

## 🚀 Execution & Operation Commands

### 1. Default Stack

Run a single worker alongside PostgreSQL, PgBouncer, Redis, and RabbitMQ:

```bash
docker compose up -d
```

### 2. Development Stack

Run the hot-reloading development container with interactive logs:

```bash
docker compose --profile development up
```

### 3. Scaled Production Stack

Launch a second worker replica plus the Scheduler:

```bash
docker compose --profile scale up -d
```

> [!WARNING]
> The `dashboard` profile does not work yet. The shared `Dockerfile` `runner` target has no `next build` stage and copies source only, while the service runs `next start`, which needs a prebuilt `.next` - the container exits immediately with *"Could not find a production build in the '.next' directory"*. Run the dashboard outside Docker until that image stage exists; see [docs/dashboard.md](../../docs/dashboard.md#running-it).
>
> There is also no OAuth2 redirect-URI variable. NextAuth derives the callback from the request; register `<dashboard-origin>/api/auth/callback/discord` on your Discord application.

### 4. Stopping Containers

```bash
# Stop active services
docker compose down

# Stop services and remove persistent volume data
docker compose down -v
```

---

## 📊 Observability Stack Setup

Launch the complete OpenTelemetry + Prometheus + Grafana telemetry stack:

```bash
docker compose --profile observability up -d
```

### Web Interfaces Access

- **Grafana Dashboards**: `http://localhost:3001` (User: `admin`, Password: `${GRAFANA_PASSWORD:-admin}`)
- **Prometheus UI**: `http://localhost:9091`
- **RabbitMQ Management**: `http://localhost:15672` (User: `lumi`, Password: `lumi`)
- **Nirn-Proxy Metrics**: `http://localhost:19000`
