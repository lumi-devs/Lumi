# `@lumi/sharding`

<div align="center">
  <img src="https://img.shields.io/badge/Package-Sharding%20Orchestrator-blue?style=for-the-badge" alt="Package">
  <img src="https://img.shields.io/badge/Backend-Redis-red?style=for-the-badge" alt="Backend">
</div>

> Redis-backed sharding orchestration, cluster coordination, dynamic in-place rebalancing, identify rate throttling, and session persistence for Gateway processes.

---

## 📦 Role & Overview

`@lumi/sharding` provides distributed shard planning and cluster management for `apps/gateway`. It enables multiple Gateway replicas to coordinate shard assignments without manual partition mapping or connection collisions.

---

## 🔑 Key Exported APIs & Surfaces

- **Shard Planner (`shard-planner.ts`)**:
  - `planShards(opts)`: Queries Discord API `/gateway/bot` to determine total shard count and recommend shard distribution.
- **Cluster Coordinator (`coordinator.ts`, `cluster-bootstrap.ts`)**:
  - `ClusterCoordinator`: Redis-backed cluster coordinator. Uses ZSET `lumi:cluster:<name>:members` for heartbeats, epoch assignment strings, and leader lock `SET NX` for automated shard distribution.
  - `attachCluster(opts)`: Joins a Gateway process to a named cluster and subscribes to topology change events (`onRebalance`).
- **Dynamic Sharding Strategy (`dynamic-strategy.ts`)**:
  - `DynamicShardingStrategy`: Custom `@discordjs/ws` sharding strategy supporting live addition (`addShards`) and removal (`removeShards`) of WebSocket shards in-place without process restarts.
- **Session & Rate Limit Infrastructure (`session-store.ts`, `redis-throttler.ts`)**:
  - `RedisSessionStore`: Persists shard session IDs and sequence numbers to Redis to enable seamless session resumes across process restarts.
  - `RedisThrottler`: Global identify rate throttler enforcing Discord's 5-identifies-per-5-seconds max limit across all cluster nodes.

---

## ⚙️ Environment Variables

| Variable | Description | Default | Notes |
|---|---|---|---|
| `CLUSTER_NAME` | Name of Gateway cluster for multi-replica coordination | `null` (standalone) | Enables cluster locks |
| `LUMI_CONSUMER_ID` / `HOSTNAME` | Unique identifier for Gateway replica node | Process Hostname | Cluster member ID |
| `REDIS_HOST` / `REDIS_PORT` | Redis connection for cluster coordination & session state | `localhost:6379` | State storage |

---

## 💻 Usage Example

```typescript
import { attachCluster } from "@lumi/sharding";

const cluster = await attachCluster({
  clusterName: "production-gateway",
  redis: redisClient,
  wsManager,
});

cluster.onRebalance((newShards) => {
  console.log(`Cluster assigned new shards: ${newShards.join(", ")}`);
});
```
