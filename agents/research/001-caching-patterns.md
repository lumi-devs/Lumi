# Research Summary: Production Discord Bot Caching & Invalidation Architecture

**Date**: 2026-11-14  
**Author**: Lead Architecture Agent  
**Subject**: Tiered In-Memory + Redis Caching with Pub/Sub Coherence for High-Load Discord Bots

---

## 1. Executive Summary

High-throughput Discord bots (serving 10k+ guilds) face an asymmetrical read/write pattern:
- **Read Traffic**: Hundreds to thousands of event checks per second (message create automod checks, permit lookups, prefix checks, active module lookups).
- **Write Traffic**: Infrequent admin configuration mutations (dashboard settings updates, role permit adjustments).

Direct database reads (PostgreSQL) on the event path cause connection pool exhaustion and high event loop latency.
Direct Redis reads reduce DB load, but network round-trips to Redis (0.5ms - 2ms) across 2,000 events/sec still introduce serialization overhead and CPU waste.

## 2. The Solution: TieredCache with Redis Pub/Sub Invalidation

By combining an in-memory **L1 cache** (zero-latency `Map`/LRU) with a distributed **L2 cache** (Redis) and an **Invalidation Bus** via Redis Pub/Sub:
1. **L1 (Local Memory)**:
   - Hit rate: ~95-99% on hot guild configurations.
   - Latency: < 0.01ms (synchronous dictionary lookup).
   - TTL: 60s - 300s bounded fallback.
2. **L2 (Redis Cluster / Instance)**:
   - Shared between Discord Gateway shards, HTTP RPC API, and background worker jobs.
   - Latency: ~0.5ms.
   - TTL: 1h - 24h.
3. **Coherence (Redis Pub/Sub)**:
   - When a configuration is modified on the dashboard (HTTP RPC):
     - PostgreSQL row updated.
     - Redis key updated/deleted.
     - `PUBLISH lumi:cache:invalidate <key>` fired.
   - All bot gateway shards and workers subscribed to `lumi:cache:invalidate` immediately evict their local L1 entry.
4. **Single-Flight Guard**:
   - Multiple concurrent queries for the same key while L1/L2 are cold collapse into a single promise, preventing dog-piling PostgreSQL.

---

## 3. Comparison of Bot Caching Architectures

| Pattern | Read Latency | Memory Footprint | Multi-Process Coherence | Database Protection |
| :--- | :--- | :--- | :--- | :--- |
| **Direct DB (Postgres)** | 5 - 20ms | Low | Instant | Poor (Pool exhaustion) |
| **Redis Only** | 0.5 - 2ms | Low (Bot process) | Instant | Good |
| **Local Memory Only** | < 0.01ms | High | Desynchronized across shards/dashboard | High |
| **TieredCache + Pub/Sub** | **< 0.01ms (L1 hit)** | **Controlled (LRU cap)** | **Near-instant (< 1ms invalidation)** | **Optimal (Single-flight + L2 hit)** |

---

## 4. Applied Design for Lumi v2

We will introduce `TieredCache` into `@lumi/db` and `@lumi/foundation`:
- `TieredCache<T>`:
  - `get(key: string, fetcher?: () => Promise<T>): Promise<T | null>`
  - `set(key: string, value: T, ttlSeconds?: number): Promise<void>`
  - `invalidate(key: string): Promise<void>`
  - `close(): Promise<void>`
- Seamless integration with existing `CacheService` and `PrismaClient`.
