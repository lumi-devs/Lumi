# Lumi v2 Caching & State Invalidation Audit

## Executive Summary

Lumi v2 implements a **two-tier cache** (L1 in-process LRU + L2 Redis) with a **Pub/Sub invalidation bus** for cross-instance coherence. The architecture is solid but has significant gaps: **no circuit breaker, no cache warming, no permit cache invalidation, no negative cache telemetry, and fragile dashboard→bot cache sync**.

---

## 1. L1 In-Process LRU Cache

**File:** `packages/cache/src/cache.ts`

| Parameter | Default | Location |
|-----------|---------|----------|
| `l1MaxSize` | 10,000 entries | L99 |
| `l1MaxTtlMs` | 5,000 ms (5s) | L100 |
| Eviction Policy | LRU (Map iteration order) | L198–202 |
| TTL Enforcement | Lazy (on read) | L178–188 |

### Implementation Details

```typescript
// L1Entry structure (L58–61)
interface L1Entry<T> {
  value: T | null;
  expiresAt: number;
}

// Eviction on setL1 (L196–208)
private setL1(fullKey: string, value: T | null, ttlMs: number): void {
  if (this.l1.has(fullKey)) this.l1.delete(fullKey);
  while (this.l1.size >= this.l1MaxSize) {
    const oldestKey = this.l1.keys().next().value;
    if (oldestKey === undefined) break;
    this.l1.delete(oldestKey);
    this.metrics?.recordEviction(this.label);
  }
  this.l1.set(fullKey, {
    value,
    expiresAt: Date.now() + Math.min(ttlMs, this.l1MaxTtlMs), // Capped at l1MaxTtlMs
  });
}
```

### Critical Observations

1. **L1 TTL capped at 5s** (`l1MaxTtlMs`) — even if you request 60s TTL, L1 entry expires in 5s. This forces Redis reads frequently.
2. **No background TTL cleanup** — expired entries only removed on next `get()` (L181–183).
3. **LRU via `Map` iteration order** — insertion order preserved, but `getL1` does `delete` + `set` to move to end (L186–187), making it true LRU.
4. **Namespaced caches share L1** — `namespace()` creates child cache with same `l1`, `flights`, `loadGenerations` maps (L134–152). No per-namespace size limit.

---

## 2. L2 Redis Cache — Codec, Negative Caching, Single-Flight

**File:** `packages/cache/src/cache.ts`, `packages/cache/src/codec.ts`

### Codec (L9–21, `packages/cache/src/codec.ts`)

```typescript
function createCodec<T>(): Codec<T> {
  return {
    encode(value: T): string { return devalue.stringify(value); },
    decode(value: string): T { return devalue.parse(value) as T; },
    encodeNull(): string { return devalue.stringify(null); },
  };
}
```

- Uses **`devalue`** for serialization (handles `Date`, `BigInt`, `RegExp`, `Map`, `Set`, cyclic refs).
- `encodeNull()` produces distinct sentinel for negative caching.

### Negative Caching (L98–99, L236–273)

| Parameter | Default | Location |
|-----------|---------|----------|
| `defaultNegativeTtlMs` | 15,000 ms (15s) | L99 |
| Stored as | `codec.encodeNull()` in Redis | L300–301 |

```typescript
// getOrLoad writes null to Redis on miss (L300–303)
const encoded = value === null ? this.codec.encodeNull() : this.codec.encode(value);
const writeTtlMs = value === null ? negativeTtlMs : ttlMs;
await this.redis.set(fullKey, encoded, "PX", writeTtlMs);
```

### Single-Flight / Request Coalescing (L63–66, L236–273)

```typescript
interface LoadFlight<T> {
  promise: Promise<T | null>;
  generation: number;
}

// getOrLoad (L250–272)
const existingFlight = this.flights.get(fullKey);
if (existingFlight) return existingFlight.promise;

// ...create new flight with generation tracking...
this.flights.set(fullKey, { promise, generation });
this.loadGenerations.set(fullKey, generation);
void this.runFlight(...).then(resolve, reject);
return promise;
```

- **Generation-based invalidation**: `loadGenerations` map tracks current generation per key (L74, L255, L295, L305).
- If invalidation arrives mid-flight, generation increments → flight becomes "stale" (L295–297, L305–313).
- Stale writes are discarded via `DELETE_IF_VALUE_SCRIPT` (L68–69, L275–283).

---

## 3. InvalidationBus — Pub/Sub Channel & Resync Logic

**File:** `packages/redis/src/invalidation.ts`

### Channel & Message Format (L4–8, L32)

```typescript
const channel = "lumi:invalidation";

interface InvalidationMessage {
  readonly namespace: string;
  readonly keys: string[];
  readonly timestamp: number;
}
```

### Subscription Model (L28–31, L82–93)

```typescript
private readonly localListeners = new Map<
  string,                              // namespace
  Set<(keys: string[]) => void>       // listeners
>();
```

- **Namespace-specific listeners** + **global (`""`) listeners** (L72–76).
- `subscribe()` returns unsubscribe function.

### Invalidation Flow (L95–105)

```typescript
async invalidate(namespace: string, keys: string[]): Promise<void> {
  const message: InvalidationMessage = { namespace, keys, timestamp: Date.now() };
  
  this.handleInvalidation(message);  // Local-first
  await this.publisher.publish(this.channel, JSON.stringify(message));
}
```

### Resync on Reconnect (L42–46, L65–69, L107–111)

```typescript
private setupSubscriber(): void {
  this.subscriber.on("ready", () => {
    if (this.hasConnected) this.signalResync();  // Reconnect → resync
    else this.hasConnected = true;
  });
}

private signalResync(): void {
  const callbacks = this.resyncCallbacks;
  this.resyncCallbacks = [];
  for (const callback of callbacks) callback();
}

onResync(): Promise<void> {
  return new Promise((resolve) => this.resyncCallbacks.push(resolve));
}
```

### Cache Integration (L116–131, `packages/cache/src/cache.ts`)

```typescript
private setupInvalidationHandlers(): void {
  this.invalidation.subscribe("", (keys) => this.discard(keys));  // Global listener

  void this.invalidation.onResync().then(() => {
    this.l1.clear();                              // Full L1 flush
    for (const fullKey of this.flights.keys()) 
      this.markDiscarded(fullKey);                // Increment generation for all flights
  });
}
```

**Resync semantics**: On Redis reconnect, **entire L1 is cleared** and **all in-flight loads are marked stale**. This is aggressive but safe.

---

## 4. Module Config Cache Invalidation on Dashboard Writes

### Dashboard Write Path (Dashboard)

**File:** `apps/dashboard/src/routes/guilds/[guildId]/modules/[module]/+page.server.ts` (L202)

```typescript
await setGuildSetting(guildId, module.configKey, parsed.values);
```

**File:** `apps/dashboard/src/lib/server/settings.ts` (L69–77)

```typescript
export async function setGuildSetting(guildId: string, key: string, value: unknown) {
  await mutateSettings(guildId, (settings) => { settings[key] = value; });
}
```

- Writes **directly to Postgres** via Prisma (serializable transaction).
- **No Redis invalidation** from dashboard.

### Bot Cache Invalidation (Bot)

**File:** `src/admin/services/ConfigService.ts` (L45–80, L68)

```typescript
private async mutate(guildId: string, mutate: ...) {
  const settings = await this.prisma.$transaction(async (tx) => { ... });
  await this.cache?.delete(guildId);  // <-- Local cache delete
  return settings;
}
```

- `ConfigService.mutate()` calls `cache.delete(guildId)` **after** DB commit.
- `cache.delete()` (L387–397, `packages/cache/src/cache.ts`):
  ```typescript
  async delete(...keys: string[]): Promise<void> {
    const fullKeys = keys.map((key) => this.makeKey(key));
    for (const fullKey of fullKeys) this.discardKey(fullKey);  // L1 discard
    if (fullKeys.length > 0) {
      await this.redis.del(...fullKeys);                        // L2 delete
      await this.invalidation.invalidate(this.label, fullKeys); // Pub/Sub
    }
  }
  ```

### Sync Gap

| Step | Actor | Cache Effect |
|------|-------|--------------|
| 1 | Dashboard | Writes to Postgres |
| 2 | Dashboard | Calls `setModuleStateViaRpc()` → bot |
| 3 | Bot RPC | Calls `ConfigService.mutate()` → `cache.delete()` |
| 4 | Bot | Publishes invalidation to Redis |

**Problem**: If RPC call fails (bot down, network), **dashboard write succeeds but bot cache stays stale**. Architecture.md (L190) claims "Bot's PermitRepository invalidates cache via Redis pub/sub" — but **module config relies on RPC, not Pub/Sub**.

---

## 5. Permit Cache Invalidation

### Current State

**File:** `packages/permits/src/repository.ts` — **No cache layer at all.**

- `getPermitChain()` (L296–423) queries **Prisma directly** every call.
- Quarantine uses Redis directly: `this.redis.get(keys.quarantine(guildId, userId))` (L335).
- No `NamespacedCache` wrapper, no invalidation.

### Architecture Claim vs Reality

`agents/architecture.md` (L189–191):
> "6. Bot's `PermitRepository` invalidates cache via Redis pub/sub; next check sees new permit"

**This is not implemented.** The `PermitRepository` has zero cache invalidation logic.

### Required Fix

Permit evaluation is **hot path** (every command). Needs:
1. L1/L2 cache for `getPermitChain` results (keyed by `guildId:userId:chainHash`)
2. Invalidation on: permit create/update/delete/move, assignment create/delete
3. Pub/Sub invalidation via `InvalidationBus` (namespace: `permits:{guildId}`)

---

## 6. Gaps & Missing Features

### 6.1 No Circuit Breaker for Redis

**Files:** `packages/cache/src/cache.ts`, `packages/redis/src/invalidation.ts`

- Cache `get()` → Redis `get()` → **no timeout, no fallback, no circuit breaker**
- `InvalidationBus` subscriber `on("ready")` fires resync, but **no health check**, no degraded mode
- If Redis is slow/unavailable: bot blocks on every cache miss

**Needed:**
```typescript
// Circuit breaker state
enum CircuitState { Closed, Open, HalfOpen }
// On Redis error: increment failures → open after threshold
// Half-open: allow probe requests → close on success
```

### 6.2 No Cache Warming

- **Cold start**: Empty L1 + L2 → first N requests all miss → thundering herd on DB
- No `warm()` API, no startup preload of hot keys (guild configs, module catalogs)
- Dashboard has `moduleCatalog` cache (L122–130, `dashboardCache.ts`) but no warm on boot

### 6.3 No Negative Cache Telemetry

**Metrics exist** (`packages/observability/src/metrics.ts` L27–32, L181–182):
```typescript
cacheNegativeHits = Counter("lumi_cache_negative_hits_total", ...)
prometheusCacheMetrics.recordNegativeHit = (ns) => cacheNegativeHits.inc({ cache: ns })
```

**But no alerts/dashboards** for:
- Negative hit ratio > threshold (indicates missing data / bad TTL)
- Negative cache pollution (too many null entries)
- Negative TTL too short/long

### 6.4 L1 TTL Too Aggressive

| Cache | `defaultTtlMs` | `l1MaxTtlMs` | Effective L1 TTL |
|-------|----------------|--------------|------------------|
| Bot config | 60,000 | 5,000 | **5s** |
| Dashboard userGuilds | 45,000 | 30,000 | 30s |
| Dashboard moduleCatalog | 60,000 | 30,000 | 30s |

**Bot config L1 effectively 5s** despite 60s Redis TTL. This defeats L1 purpose for config.

### 6.5 No Distributed Lock for Cache Stampede Protection

- Single-flight (`LoadFlight`) protects **per-process** only
- Multiple bot instances → each has own L1 → **each gets cache miss** → each runs loader
- Redis `SET NX` + Lua script needed for cross-instance single-flight

### 6.6 InvalidationBus: No Acknowledgment / Reliability

- `invalidate()` publishes → **fire-and-forget**
- No delivery guarantee, no retry, no dead-letter
- If subscriber disconnected during publish → **misses invalidation** → resync on reconnect clears L1 (heavy-handed)

### 6.7 Metrics Cardinality Explosion Risk

- `CacheMetrics` label: `namespace` (L168–175)
- Each `namespace()` call creates new label value (L134–152)
- Unbounded cardinality if modules create dynamic namespaces

---

## 7. Recommendations

### Priority 1: Critical Fixes

| Issue | Fix | Files |
|-------|-----|-------|
| Permit cache missing | Add `PermitCache` wrapper around `PermitRepository` with invalidation on CRUD | `packages/permits/src/repository.ts`, new `cache.ts` |
| Dashboard→bot sync gap | Add Pub/Sub invalidation from dashboard writes (or use Prisma CDC) | `apps/dashboard/src/lib/server/settings.ts`, `src/admin/services/ConfigService.ts` |
| Circuit breaker | Wrap Redis client with breaker; degrade to DB-only on open | `packages/cache/src/cache.ts`, `packages/redis/src/invalidation.ts` |

### Priority 2: Reliability

| Issue | Fix |
|-------|-----|
| L1 TTL cap | Make `l1MaxTtlMs` configurable per-namespace; default to `defaultTtlMs` |
| Cache warming | Add `Cache.warm(keys, loader)`; call on startup for guild configs, module catalog |
| Distributed single-flight | Redis `SET NX` + Lua for cross-instance coalescing |
| Invalidation reliability | Add Redis Streams or acknowledgment protocol |

### Priority 3: Observability

| Issue | Fix |
|-------|-----|
| Negative cache alerts | Add Prometheus rules: `lumi_cache_negative_hits_total / (lumi_cache_hits_total + lumi_cache_misses_total) > 0.3` |
| Cardinality control | Hash namespace labels, or use fixed bucket labels |
| Fill duration p99 | Alert on `histogram_quantile(0.99, lumi_cache_fill_duration_seconds) > 1s` |

### Priority 4: Architecture

| Issue | Fix |
|-------|-----|
| Permit evaluation hot path | Cache `getPermitChain` result with 10–30s TTL; invalidate on permit/assignment changes |
| Config version migrations | Cache migrated config (current code re-migrates on every cache miss) |
| Module enable/disable | Invalidate `config:{guildId}` + `modules:{guildId}` on toggle |

---

## 8. File Reference Map

| Concern | Files |
|---------|-------|
| L1 LRU implementation | `packages/cache/src/cache.ts` (L58–61, L178–208) |
| L2 Redis codec | `packages/cache/src/codec.ts`, `packages/cache/src/cache.ts` (L102, L226, L300) |
| Negative caching | `packages/cache/src/cache.ts` (L99, L236–273, L300–303) |
| Single-flight | `packages/cache/src/cache.ts` (L63–66, L236–273, L295–313) |
| InvalidationBus | `packages/redis/src/invalidation.ts` |
| Resync logic | `packages/redis/src/invalidation.ts` (L42–46, L65–69), `packages/cache/src/cache.ts` (L116–131) |
| Module config cache | `src/admin/services/ConfigService.ts`, `src/core/services.ts` (L43–50) |
| Dashboard writes | `apps/dashboard/src/lib/server/settings.ts`, `apps/dashboard/src/routes/guilds/[guildId]/modules/[module]/+page.server.ts` |
| Permit repository | `packages/permits/src/repository.ts` |
| Metrics | `packages/observability/src/metrics.ts` (L13–68, L167–191) |
| Dashboard cache config | `apps/dashboard/src/lib/server/dashboardCache.ts` (L112–130) |
| Bot cache config | `src/core/services.ts` (L43–50) |

---

## 9. Benchmark Comparison

| Feature | Lumi v2 | YAGPDB | Skyra | Red-DiscordBot |
|---------|---------|--------|-------|----------------|
| L1 Cache | LRU Map (5s TTL cap) | Redis-only | In-memory (TTL) | In-memory (TTL) |
| L2 Cache | Redis + devalue | Redis | Redis | Redis / RedisCluster |
| Negative Cache | Yes (15s TTL) | No | No | No |
| Single-Flight | Per-process (generation) | No | No | No |
| Invalidation | Pub/Sub (Redis) | Redis Pub/Sub | Redis Pub/Sub | IPC / Redis Pub/Sub |
| Resync on Reconnect | Full L1 flush | N/A | Full flush | Full flush |
| Circuit Breaker | **Missing** | **Missing** | **Missing** | **Missing** |
| Cache Warming | **Missing** | No | No | No |
| Permit/Perm Cache | **Missing** | Cached | Cached | Cached |
| Distributed Lock | **Missing** | Redis Lock | No | Redis Lock |

**Lumi v2 leads on**: Negative caching, single-flight, generation-based invalidation.
**Lumi v2 lags on**: Circuit breaker, cache warming, permit caching, distributed coordination.

---

*Generated by LumiCacheAudit agent — research only, no code changes.*