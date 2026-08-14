# ⏰ @lumi/scheduler

<div align="center">
  <img src="https://img.shields.io/badge/Status-Production_Ready-brightgreen?style=for-the-badge" alt="Status">
  <img src="https://img.shields.io/badge/Bun-1.3+-black?style=for-the-badge&logo=bun" alt="Bun">
  <img src="https://img.shields.io/badge/TypeScript-5.9-blue?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Role-scheduler-purple?style=for-the-badge" alt="Role">
  <img src="https://img.shields.io/badge/Engine-BullMQ-red?style=for-the-badge" alt="Engine">
</div>

<br />

The **Lumi Scheduler** (`@lumi/scheduler`) is a specialized, headless background worker responsible for managing delayed jobs, recurring cron tasks, and time-based module effects across the Lumi ecosystem.

---

## 📖 Table of Contents

- [Overview](#-overview)
- [Architecture & Data Flow](#-architecture--data-flow)
- [Configuration & Environment Variables](#-configuration--environment-variables)
- [Development & Running Instructions](#-development--running-instructions)
- [Observability & Health Probes](#-observability--health-probes)

---

## 🌟 Overview

The scheduler service guarantees accurate execution of time-sensitive operations (e.g., temporary voice channel expiration, delayed moderation mutes/bans, scheduled user reminders):

- **Headless & WS-Free Operation**: Does not open or maintain Discord Gateway WebSocket connections, preserving token gateway identify limits.
- **BullMQ Task Queue Engine**: Backed by **BullMQ** (using Redis DB index `1`), handling exponential backoff retries, job deduplication, and delayed triggers.
- **Distributed Leader Election**: Supports optional Redis-based active/passive leader locking (`SCHEDULER_LEADER_LOCK=true`) to enable high-availability (HA) multi-replica deployments without duplicate task execution.
- **Shared Queue, No Broker Hop**: Workers enqueue straight onto the same BullMQ queue (Redis DB `1`), so a job is durable the moment it is created and does not depend on the scheduler being up to be *scheduled*. The scheduler is extra queue capacity dedicated to running them, not a gatekeeper.
- **Task Fire Event Dispatcher**: Emits task fire notifications over the event bus (`lumi.scheduler.fire:<task>`) when scheduled timers trigger, allowing worker nodes to execute final Discord side-effects.

> [!NOTE]
> In production environments with multiple scheduler instances, enable `SCHEDULER_LEADER_LOCK=true`: standby replicas block on the lock before booting their BullMQ worker, so only one scheduler replica draws from the queue. This is about scheduler replicas among themselves - BullMQ's own queue semantics already stop any two owners (scheduler or worker) from running the same job.

---

## 🏗️ Architecture & Data Flow

### Task Scheduling Lifecycle

```mermaid
sequenceDiagram
    autonumber
    participant Worker as apps/worker
    participant EB as Event Bus (Redis Streams)
    participant Sched as apps/scheduler (Leader)
    participant Redis as Redis (DB 1 - BullMQ)
    participant DB as PostgreSQL 17

    Worker->>Redis: Enqueue BullMQ Delayed Job (e.g. TempVC Expiration in 10m)
    Redis-->>Worker: Job Persisted

    Note over Sched,Redis: 10 minutes pass...

    Redis->>Sched: Job Triggered (any BullMQ owner; exactly one wins it)
    Sched->>DB: Query Task Context Data
    Sched->>EB: Emits Task Fire Event (lumi.scheduler.fire:<task>)
    EB->>Worker: Worker Receives Task Fire Trigger
    Worker->>Worker: Executes Final Action (Delete Channel / Unmute User)
```

---

## ⚙️ Configuration & Environment Variables

Configure `@lumi/scheduler` using environment variables:

| Environment Variable | Required | Default | Description |
|---|:---:|:---:|---|
| `BOT_TOKEN` | **Yes** | - | Discord Bot Token (used for Sapphire framework initialisation). |
| `LUMI_ROLE` | **Yes** | `scheduler` | Identifies the process role (`scheduler`). |
| `SCHEDULER_LEADER_LOCK` | No | `false` | Enables Redis leader election for HA deployments. |
| `SCHEDULER_LEADER_LOCK_TTL_MS` | No | `30000` | Lease duration in milliseconds for the leader key lock. |
| `SCHEDULER_LEADER_LOCK_RENEW_MS` | No | `10000` | Renewal heartbeat interval for the active leader. |
| `REDIS_HOST` | No | `localhost` | Redis server hostname. |
| `REDIS_PORT` | No | `6379` | Redis server network port. |
| `REDIS_PASSWORD` | No | - | Redis authentication password. |
| `REDIS_TASK_DB` | No | `1` | Redis database index used exclusively for BullMQ task queues. |
| `RPC_HTTP_HOST` | No | `127.0.0.1` | Bind host for the internal RPC HTTP server. |
| `RPC_INTERNAL_TOKEN` | In production | - | Shared secret required as `Authorization: Bearer` on every internal RPC call. |
| `RPC_HTTP_PORT` | No | `8091` | Bind port for the internal RPC HTTP server. |
| `POSTGRES_URL` | **Yes** | - | PgBouncer or Postgres database connection string. |
| `METRICS_ENABLED` | No | `true` | Enables HTTP metrics and health check server. |
| `METRICS_PORT` | No | `9090` | Network port for Prometheus metrics and health probes. |

> [!TIP]
> Ensure `REDIS_TASK_DB` is kept isolated (default: `1`) from general caching (`REDIS_CACHE_DB`: `0`) to prevent cache flush commands from purging active scheduled tasks.

---

## 🚀 Development & Running Instructions

### Local Development

Ensure PostgreSQL and Redis are available:

```bash
# Set environment variables and launch scheduler
BOT_TOKEN="your-discord-bot-token" LUMI_ROLE="scheduler" bun apps/scheduler/src/main.ts
```

### Docker Compose

Launch the scheduler as part of the scaled production profile:

```bash
docker compose --profile scale up -d scheduler
```

---

## 📊 Observability & Health Probes

The scheduler exposes an HTTP server on `METRICS_PORT` (default `9090`).

### Endpoint Reference

| Endpoint | Method | Status Code | Description |
|---|---|:---:|---|
| `/healthz` | `GET` | `200` | Liveness check for the process. |
| `/readyz` | `GET` | `200` / `503` | Evaluates system probes (`postgres`, `redis`, `scheduler-tasks`, `scheduler-leader`). |
| `/metrics` | `GET` | `200` | Exports Prometheus metrics including `lumi_failed_jobs_total` and queue lengths. |

### Registered Readiness Probes

- `postgres`: Confirms database query execution (`SELECT 1`).
- `redis`: Verifies Redis connectivity (`PING` -> `PONG`).
- `scheduler-tasks`: Confirms BullMQ task container initialization.
- `scheduler-leader`: Validates leadership ownership when `SCHEDULER_LEADER_LOCK=true`.
