---
title: "Distributed Sharding"
description: "Process sharding model, child process lifecycle, and primary shard election."
category: "Core Architecture"
---

# Distributed Sharding

Lumi scales across multiple Discord gateway shards using discord.js's native `ShardingManager` combined with zero-coordination primary shard election.

## Shard Topology

```
┌─────────────────────────────────────────────────────────────┐
│ apps/worker/src/main.ts (ShardingManager)                   │
│  • Thin parent process - opens no gateway connections       │
│  • Spawns and supervises child OS processes per shard       │
└──────────────┬──────────────────────────────┬───────────────┘
               │                              │
               ▼                              ▼
┌──────────────────────────────┐ ┌──────────────────────────────┐
│ Shard 0 (Primary Shard)      │ │ Shard 1 (Worker Shard)       │
│  • Discord Gateway (Shard 0) │ │  • Discord Gateway (Shard 1) │
│  • BullMQ Task Scheduler     │ │  • Command Execution         │
│  • HTTP RPC Server (8091)    │ │  • Event Bus Consumer        │
│  • Prometheus Server (9090)  │ │                              │
└──────────────────────────────┘ └──────────────────────────────┘
```

---

## Primary Shard Election

Instead of running a separate scheduler daemon or coordinating leader election with distributed locks, exactly one shard process per cluster is elected primary based on holding **Shard ID `0`**:

```ts
// packages/core/src/lib/env.ts
export function isPrimaryShard(): boolean {
  return container.client?.shard?.ids.includes(0) ?? true;
}
```

The primary shard process automatically binds:
1. **HTTP RPC Bridge (`8091`)**: Handles dashboard API mutations.
2. **Prometheus Metrics (`9090`)**: Scraped by Prometheus/Grafana.
3. **BullMQ Scheduler**: Dispatches recurring cron jobs over Redis Streams.
