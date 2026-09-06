---
title: "System Architecture"
description: "How Lumi runs: the worker process, sharding, the Redis Streams event bus, and database persistence."
category: "Core Architecture"
---

Lumi is designed around a simple architectural rule: **your bot logic and Discord gateway connection run together in worker processes, while the web dashboard connects to them over a secure internal API.**

This means the web dashboard never touches your bot token or database directly, and the bot continues running seamlessly even if the dashboard is offline.

---

## The Two Applications

Lumi is organized as two decoupled services in the monorepo:

| Service | Location | Purpose |
| :--- | :--- | :--- |
| **Worker** | `apps/worker` | Connects to the Discord Gateway, processes interactions, runs moderation filters, and executes all commands and background tasks. |
| **Dashboard** | `apps/dashboard` | An optional Next.js web console where server admins manage settings, review moderation audit logs, and configure modules. |

The dashboard communicates with the worker through an internal HTTP RPC server (port `8091`), authenticated with a shared secret (`RPC_INTERNAL_TOKEN`).

---

## How Workers & Sharding Work

When your bot joins thousands of Discord servers, Discord requires splitting connections into **shards**.

1. **Manager Process**: When you start Lumi (`apps/worker/src/main.ts`), it launches a lightweight sharding manager.
2. **Shard Processes**: The manager spawns isolated child processes for each shard. Each child process runs the full bot engine (`LumiClient`) with its own connection to Discord.
3. **Primary Shard**: Exactly one process (the one running Shard `0`) takes on singleton responsibilities:
   - Scheduling recurring BullMQ cron jobs (like daily data retention sweeps).
   - Serving the internal RPC endpoint for the web dashboard.
   - Exposing Prometheus `/metrics` on port `9090`.

If a shard crashes, the manager automatically restarts it without interrupting the other shards.

---

## The Redis Streams Event Bus

Because shards run in separate processes, they need a way to communicate. Lumi uses **Redis Streams** as a high-throughput, reliable event bus.

### Why Redis Streams?

- **At-Least-Once Delivery**: Events are queued durably. If a worker process restarts mid-task, unacknowledged events are reclaimed and completed.
- **Cross-Shard Coordination**: An event triggered on Shard 1 (such as a moderation ban) can notify the web dashboard or invalidate caches across all other shards in milliseconds.
- **Dead-Letter Handling**: If an event handler fails repeatedly (after 5 attempts), the message is moved to a dead-letter queue (`dlq`) rather than blocking the stream.

---

## The Data Layer: PostgreSQL & Prisma

All durable configuration, moderation records, and server settings are stored in **PostgreSQL 18** using **Prisma 6**.

- **PgBouncer Connection Pooling**: In production, worker processes connect through PgBouncer (port `6432`) in transaction mode, preventing connection exhaustion even with dozens of active shards.
- **Stampede-Proof L1 Cache**: High-frequency lookups (such as guild prefixes and module states) are cached in memory. When 100 users message the bot simultaneously, Lumi makes exactly one database query.
- **Distributed Invalidation**: When a setting changes via slash command or the dashboard, an invalidation message publishes over Redis to clear the in-memory cache on every worker.

---

## Observability & Health Checks

Every production instance exposes standard monitoring endpoints:

- `GET http://127.0.0.1:9090/healthz` — Service liveness probe. Returns HTTP 200 when the shard is alive.
- `GET http://127.0.0.1:9090/readyz` — Readiness probe. Verifies active connections to PostgreSQL and Redis.
- `GET http://127.0.0.1:9090/metrics` — Prometheus metrics covering gateway WebSocket ping, command latency, event throughput, and database query durations.
