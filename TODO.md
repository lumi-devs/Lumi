# Lumi 10/10 Enterprise Scalability Migration Plan

This plan documents the roadmap to transition Lumi from a high-performance bot (~8.5/10) to a massive-scale enterprise Discord bot (10/10) capable of serving 50,000+ servers (Dyno/Wick class).

---

## Phase 1: Decouple Discord Gateway & Slim In-Memory State

### Problem
`discord.js` retains extensive internal structures per guild/channel/user. At 5,000+ guilds per process, JavaScript heap pressure leads to garbage collection pauses, dropped WebSocket heartbeats, and high memory usage (300MB–1GB+ per shard).

### Tasks
- [ ] **1.1 Deploy Gateway Proxy (Rust/Twilight or Go-based proxy)**
  - Implement or adopt a standalone gateway proxy daemon (e.g. [twilight-gateway](https://github.com/twilight-rs/twilight) or custom Go worker).
  - Proxy connects to Discord Gateway WebSocket, handles heartbeating, reconnects, and rate limits.
  - Publish stripped gateway dispatch events (`MESSAGE_CREATE`, `INTERACTION_CREATE`, `VOICE_STATE_UPDATE`) into Redis/Valkey Streams or RabbitMQ.
- [ ] **1.2 Make Lumi Worker Stateless (No direct WebSocket)**
  - Convert `apps/worker` to pull parsed events from message broker queues rather than running `Client.login()`.
  - Route REST requests through a centralized rate-limited REST proxy service (`apps/api` or dedicated REST daemon).
- [ ] **1.3 Zero-Cache Gateway Handlers**
  - Eliminate in-memory Discord.js structures for inactive guilds.
  - Rely on Valkey/Redis for short-lived operational caches (e.g., active voice state occupancy, temporary permissions).

---

## Phase 2: High-Performance Addon Storage Engine (Without Touching Core Schema)

### Problem
Third-party addons (`lumi-addons`) are isolated from core Prisma migrations by design. They must rely on the host's KV facades (`lumi/kv`). However, serialized counter increments (e.g. `nextConfessionNumber` using in-memory `AsyncQueue` + full JSON round-trips) and unindexed JSON blob lookups degrade under massive concurrency.

### Tasks
- [ ] **2.1 Native Atomic Counter & Hash Operations on `lumi/kv`**
  - Add atomic counter increments directly to the KV facade (`kv.incr(guildId, module, target, key, delta)`).
  - Back the operation with native Valkey/Redis atomics (`HINCRBY`) instead of Node.js-level locks (`AsyncQueue`), eliminating race conditions and lock timeouts across distributed worker pods.
- [ ] **2.2 High-Throughput Write-Behind Buffering**
  - For high-write addons (like bulk audit events, reply tracking, and telemetry), provide a buffered append-only stream API (`kv.append(stream, payload)`).
  - The core host flushes buffered writes to `module_dynamic_data` in batches asynchronously, eliminating write-lock contention.
- [ ] **2.3 JSONB Gin Indexing on `module_dynamic_data`**
  - Without altering the table structure, add a PostgreSQL GIN index on `module_dynamic_data.value`:
    ```sql
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_module_dynamic_data_gin ON module_dynamic_data USING gin (value);
    ```
  - This allows addons to run efficient JSON subfield queries without needing custom table migrations in core Prisma.
- [ ] **2.4 Granular Sub-Key KV Storage for Addon Collections**
  - Allow addons to store collections as discrete hash fields (`HSET` / composite sub-keys) rather than giant serialized array blobs (e.g., storing individual shared roles instead of re-serializing the entire array on every permission update).

---

## Phase 3: Distributed Multi-Node Clustering & Consistent Hashing

### Problem
`apps/worker` currently relies on local `ShardingManager` within a single container/machine. To scale across multiple physical machines or Kubernetes nodes, shard allocation and gateway traffic must distribute horizontally.

### Tasks
- [ ] **3.1 Distributed Shard Coordinator**
  - Replace standalone `ShardingManager` with a distributed coordinator (using Valkey/Redis lock + leases).
  - Shard workers register on boot, claim a range of shard IDs via distributed consensus, and heartbeat their leases.
- [ ] **3.2 Consistent Hashing for Guild Routing**
  - Ensure all events for a given `guild_id` are consistently routed to the same worker instance for local lock-free state execution.
  - Implement Rendezvous Hashing or Ketama hashing in the event-distribution layer.
- [ ] **3.3 Cluster-Aware Voice State Routing**
  - Expand `TempVcRegistry` and voice occupancy tracking to support cross-pod event invalidation over Valkey Streams.
- [ ] **3.4 Helm / Kubernetes Multi-Pod DaemonSet Configuration**
  - Update `deploy/k8s/` manifests to deploy workers as a StatefulSet or auto-scaling Deployment with health/readiness probes mapped to distributed shard status.

---

## Phase 4: Battle-Tested Patterns Adopted from YAGPDB Architecture

YAGPDB scales across 1,000,000+ servers using targeted Go primitives. Lumi can adapt the following mechanisms into its Bun/TypeScript stack:

### 1. `dshardorchestrator` Style Dynamic Shard Leasing & Rolling Hand-off
- [ ] **4.1 Dynamic Shard Lease Coordinator in Valkey**
  - Instead of hardcoding `SHARDS` per container, workers register their node IDs in a Valkey sorted set (`lumi:cluster:nodes`) with TTL-based heartbeats.
  - A coordinator leases shard ranges dynamically (e.g. Node A gets shards 0–15, Node B gets 16–31).
- [ ] **4.2 Zero-Downtime Shard State Hand-off**
  - Implement YAGPDB's rolling shard hand-off: when a node shuts down for updates, it signals the peer node via Valkey to take over the shard connection and state before terminating the old WebSocket, avoiding reconnect storms.

### 2. Sparse `dstate` Cache Pruning (Aggressive Memory GC)
- [ ] **4.3 Sparse Guild State Mode**
  - Cache only essential guild routing attributes (IDs, roles, channel structures, permissions).
  - Strip offline member identities and message histories completely after a short configurable lifetime (YAGPDB `RemoveOfflineMembersAfter` pattern).
- [ ] **4.4 Per-Shard Isolated Memory Buckets**
  - Ensure guild caches are isolated per shard rather than stored in a shared global JavaScript map, avoiding cross-shard V8 GC lock contention.

### 3. Dedicated Guild & Member Fetch Batching
- [ ] **4.5 Coalesced Member Fetcher Queue**
  - Adopt YAGPDB's `shardmemberfetcher`: batch individual member fetch calls occurring across commands or events within a 50ms window into single batched Discord Gateway requests (`REQUEST_GUILD_MEMBERS` chunking) or REST queries, avoiding HTTP 429 rate limit exhaustion.

---

## Verification & Benchmarks
- [ ] Benchmark synthetic load: 10,000 events/second sustained through Valkey Streams.
- [ ] Verify maximum memory per worker container stays under 150MB under load.
- [ ] Stress-test shard re-balancing during pod crash / rolling deployment.
