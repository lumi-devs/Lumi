# `@lumi/scheduler` (`apps/scheduler`)

<div align="center">
  <img src="https://img.shields.io/badge/Role-Background%20Scheduler-blue?style=for-the-badge" alt="Role">
  <img src="https://img.shields.io/badge/Engine-BullMQ-red?style=for-the-badge" alt="Engine">
  <img src="https://img.shields.io/badge/CatchUp-Grace%20Period-green?style=for-the-badge" alt="CatchUp">
</div>

> Dedicated background task management application owning BullMQ queues and publishing task execution events to stateless worker nodes.

---

## 📦 Role & Overview

`apps/scheduler` runs under `LUMI_ROLE=scheduler` in distributed Lumi deployments.

### Key Responsibilities
- **BullMQ Task Management**: Owns the BullMQ queue and worker process (`@sapphire/plugin-scheduled-tasks`).
- **Zero WebSocket Connections**: Holds zero Discord WebSocket connections (`roleOpensWS = false`).
- **Catch-Up Policy Evaluation**: Evaluates task timestamps against `CatchUpMeta` grace periods (`DEFAULT_CATCHUP_GRACE_MS = 60,000ms`) via `RelayTask.run()` before execution.
- **Task Event Relay**: Re-publishes task execution triggers onto RabbitMQ / event bus (`lumi.scheduler.fire:<name>`) for stateless worker nodes to process.

---

## 🏛️ Monorepo Architecture Position

```
Non-Scheduler Process ──scheduleTask()──▶ Redis BullMQ ──▶ apps/scheduler (RelayTask) ──Relay Fire Event──▶ apps/worker
```

---

## ⚙️ Environment Variables

| Variable | Description | Required / Default | Notes |
|---|---|---|---|
| `LUMI_ROLE` | Must be set to `scheduler` | ✅ **Required** | Defines runtime role |
| `BOT_TOKEN` | Discord Bot Token | ✅ **Required** | Token verification |
| `REDIS_HOST` / `REDIS_PORT` | Redis server hosting BullMQ queues | `localhost:6379` | Task queue backend |
| `RABBITMQ_URL` | RabbitMQ URI for task event fanout | `amqp://guest:guest@localhost:5672` | Event fanout |
| `DATABASE_URL` | PostgreSQL connection URI | ✅ **Required** | Database access |
| `METRICS_PORT` | Prometheus metrics port | `9090` | Exposes task stats |

---

## 💻 Usage & Execution Snippet

```bash
# Run Scheduler node manually
LUMI_ROLE=scheduler bun apps/scheduler/src/main.ts

# Docker execution
docker compose --profile distributed up -d scheduler
```
