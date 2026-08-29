---
title: "Event Bus & Redis Streams"
description: "Distributed message bus and scheduled task dispatch across worker shards using Redis Streams."
category: "Core Architecture"
---

# Event Bus & Redis Streams

Lumi distributes scheduled tasks, cache invalidation events, and cross-shard notifications using **Redis Streams** via `@lumi/event-bus`.

## Architecture Overview

```
 ┌───────────────────────────────────────────────┐
 │ Primary Shard (Shard 0)                       │
 │  • BullMQ Task Scheduler                      │
 │  • Evaluates cron / delayed task triggers     │
 └──────────────────────┬────────────────────────┘
                        │
                        ▼ Redis XADD
 ┌───────────────────────────────────────────────┐
 │ Redis Stream: lumi:events                     │
 └──────┬───────────────────────┬────────────────┘
        │                       │
        ▼ Redis XREADGROUP      ▼ Redis XREADGROUP
 ┌──────────────┐        ┌──────────────┐
 │ Shard 0      │        │ Shard 1      │
 │ (Worker Pod) │        │ (Worker Pod) │
 └──────────────┘        └──────────────┘
```

---

## Consumer Groups & Delivery Guarantees

Each worker process joins the consumer group for its assigned shard. The event bus guarantees:

1. **At-Least-Once Delivery**: Events are acknowledged (`XACK`) only after successful execution.
2. **Pending Message Reclamation**: Unacknowledged messages older than `EVENT_STREAM_CLAIM_MIN_IDLE_MS` (default 60s) are claimed by surviving shard processes.
3. **Stream Truncation**: Streams are capped using approximate length limits (`EVENT_STREAM_MAXLEN`, default `100000`) to prevent unbounded memory growth.

---

## Invalidation Bus

When guild configuration or permit rules are modified via the web dashboard or commands:

```ts
// Invalidate cache across all shards
await container.invalidation.invalidateGuild(guildId);
```

Every shard process receives the invalidation event over Redis and flushes its local in-memory guild cache immediately.
