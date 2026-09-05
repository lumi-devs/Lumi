# Performance Audit Report - Lumi

**Date:** September 3, 2026  
**Scope:** Wave 8 - Database queries, Redis caching, RPC contracts, job queues  
**Verdict:** Architecture is sound; multiple optimization opportunities identified at P2-P3 priority

---

## Overview

Lumi's performance foundation is **mature and well-designed**:
- Repositories use proper pagination, transactions, and batch operations
- Redis cluster-safe operations correctly handle multi-slot workloads
- Scheduled task catch-up policy prevents thundering herds on startup
- Cache invalidation uses pub/sub with automatic resync

However, several medium-priority improvements will improve latency and reliability under load:
1. Cache TTL inconsistencies create unintended stale-data windows
2. Permission checks may perform N+1 queries on multi-target commands
3. RPC responses over-fetch unnecessary columns
4. Message statistics increment Redis synchronously on hot path

---

## 1. Database Performance

### Good Patterns Observed

**Pagination:** Fleet-wide sweeps use keyset pagination correctly:
```typescript
// Correct: uses cursor pagination with dedicated index
async *iterateCases(where, pageSize = 500) {
  for (;;) {
    const page = await this.reader.moderationCase.findMany({
      where,
      orderBy: { id: "asc" },
      take: pageSize,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
    });
    if (page.length === 0) return;
    yield page;
    cursor = page[page.length - 1]?.id;
  }
}
```

**Batch Operations:** Multiple repositories implement batch methods:
```typescript
getModerationCasesByIds(ids: number[]): Promise<ModerationCase[]>
liftModerationCases(ids: number[]): Promise<void>
```

**Transactions:** Critical operations (case creation) use `$transaction`:
```typescript
return this.prisma.$transaction(async (tx) => {
  // Atomic: read max + increment counter + create case
});
```

**Indexes:** Schema includes hot-path indexes:
- `moderationCase[guildId, active, expiresAt]` for expiry sweeps
- `moderationCase[active, id]` for audit sweeps
- `permitAssignment[guildId, targetType, targetId]` for permission checks

### Identified Issues

#### Issue 1: N+1 Risk in Permission Resolution

**Severity:** MEDIUM  
**Location:** `packages/core/src/lib/permissions/PermitResolver.ts` (not fully reviewed)

When a multi-target command like `,ban @user1 @user2 @user3` runs, permission checks must verify all targets. If `PermitResolver` queries assignments per target, this creates N+1:
```typescript
// BAD: one query per target
for (const targetId of targetIds) {
  const assignment = await db.permitAssignment.findFirst({
    where: { permitId, targetType, targetId }
  });
}

// GOOD: batch in one query
const assignments = await db.permitAssignment.findMany({
  where: { 
    permitId, 
    targetType,
    targetId: { in: targetIds }
  }
});
```

**Action:** Audit `PermitResolver.resolveTargets()` and similar methods. Verify batch queries with `id: { in: [...] }` instead of loops.

#### Issue 2: Over-Fetching in RPC Responses

**Severity:** MEDIUM  
**Location:** `packages/core/src/lib/rpc/core-rpc.ts` (audit actions)

RPC handlers return full objects when dashboards need only subset:
```typescript
// Likely fetches all columns: guildId, userId, action, platform, 
//   metadata, timestamp, executorId, targetType, targetId, reason, ...
registerRpcHandler(RPC_ACTIONS.systemAuditList, async (req) => {
  const [entries] = await db.audit.findMany({
    // Missing: select: { id: true, timestamp: true, action: true, actor: true }
  });
  return paginate(entries);
});
```

**Impact:** At 50 bytes per extra column × 25 rows per page × 100 RPC calls/min = ~125 KB/min of unnecessary data transferred.

**Action:** 
1. Add `select: {...}` to all paginated RPC queries
2. Measure typical response sizes for top 10 RPC actions
3. Consider compression for large exports (`gdprExport`)

#### Issue 3: Message Statistics on Hot Path

**Severity:** LOW  
**Location:** `packages/core/src/lib/client/LumiClient.ts`

Every user message increments a counter:
```typescript
this.on("messageCreate", (m) => {
  if (!m.author.bot) container.stats.messages++;
});
```

If `stats.messages++` calls Redis INCR, this is 1000 Redis commands/sec at 100 msg/sec load.

**Action:** Batch statistics:
```typescript
let messageCount = 0;
const BATCH_SIZE = 100;

this.on("messageCreate", (m) => {
  if (!m.author.bot) {
    messageCount++;
    if (messageCount >= BATCH_SIZE) {
      container.redis.incrby("lumi:stats:messages", messageCount);
      messageCount = 0;
    }
  }
});
```

---

## 2. Redis & Cache Performance

### Good Patterns Observed

**Cluster Safety:** `cluster-safe.ts` correctly handles multi-slot operations:
- `mgetSafe()`: groups by slot, parallelizes, preserves order
- `scanKeysSafe()`: walks all master nodes
- `pipelineBySlot()`: splits pipelines per slot
- `delSafe()`: per-slot deletions

No performance concerns here; this is production-grade.

**Invalidation Bus:** Pub/sub with automatic resync is sound design. Shards subscribe to invalidation channel and re-fetch on reconnection.

### Identified Issues

#### Issue 1: Inconsistent Cache TTLs

**Severity:** MEDIUM  
**Location:** `packages/core/src/lib/database/redis.ts::RedisTTL`

```typescript
guildConfig: 60,                  // Module config: 60s
guildAllModuleConfigs: 60,        // All configs: 60s
globalConfig: 120,                // Global config: 120s (2x longer!)
permOverrides: 120,               // Per-command perms: 120s
permits: 120,                     // Permit bundles: 120s
moduleEnabledCache: 30,           // Module enabled: 30s (shortest!)
blockedCache: 300,                // Blocklist: 300s (longest!)
```

**Problem:** No documented reason for different values. Could create stale-data windows:
- If global config cache is 120s and per-shard module-enabled is 30s, a shard might be using old global config with new module state for 90s

**Recommended Action:**
1. Unify TTLs by cache category:
   ```
   CONFIG (guild + module + global): 60s
   PERMISSIONS (permits, overrides): 120s
   MODERATION (blocked, quarantine): 300s+
   SECURITY (windows, joined bursts): 30s
   ```
2. Document cache hierarchy and dependencies
3. Add comment explaining why each TTL was chosen

#### Issue 2: Cache Invalidation on Shard Restart

**Severity:** MEDIUM  
**Location:** `packages/core/src/lib/database/redis.ts::InvalidationBus`

When a shard reconnects to Redis:
```typescript
#onReady = () => {
  if (!this.#connectionDropped) return;
  this.#connectionDropped = false;
  for (const fn of this.#resyncListeners) {
    Promise.resolve(fn()).catch(...)
  }
};
```

**Problem:** Resync doesn't know which keys were invalidated during outage. If 1M keys are cached and shard was offline 10s, resync may re-fetch all 1M keys at once, hammering the database.

**Recommended Action:**
1. Track "last invalidation watermark" per cache type
2. On resync, only fetch keys modified after watermark
3. Add database-level audit log for cache changes during the outage window

#### Issue 3: Unbounded Redis Keys on User/Guild Deletion

**Severity:** MEDIUM  
**Location:** Multiple cache key patterns for per-user and per-guild data

Keys like:
- `lumi:mod:${guildId}:quarantine:${userId}` (expires after 30 days)
- `lumi:perms:${commandPath}:${guildId}` (expires after 120s)

When a guild is deleted or user is anonymized (GDPR), these keys are **not proactively cleaned**. They rely on TTL expiration.

**Impact:** After 1M guild deletion, Redis can accumulate stale keys until their TTL expires.

**Recommended Action:**
1. On guild/user delete, call `delSafe()` on all related key patterns
2. Use SCAN to find and delete expired keys (monthly cleanup job)
3. Consider shorter TTLs for per-user keys to reduce cleanup burden

---

## 3. RPC Architecture Performance

### Issues Identified

#### Issue 1: No Versioning Strategy

**Severity:** LOW  
**Location:** `packages/core/src/lib/rpc/core-rpc.ts` (all action registrations)

If an RPC action payload changes (e.g., adding a required field), old dashboards will break without a clear upgrade path.

**Recommended Action:**
1. Add versioning to RPC responses: `{ version: 1, data: {...} }`
2. New endpoints: `systemAuditListV2` when breaking changes happen
3. Deprecation timeline: log when old actions are called, plan removal

#### Issue 2: No Per-Action Rate Limiting

**Severity:** MEDIUM  
**Location:** RPC HTTP server (likely `http-server.ts`, not reviewed in detail)

All RPC actions authenticated by static token. No rate limiting per:
- Actor ID
- Action type
- Client IP

**Recommended Action:**
1. Track RPC calls per actorId in Redis (sliding window)
2. Reject if > 100 calls/min per action
3. Return 429 Too Many Requests

---

## 4. Scheduled Tasks & Job Queues

### Unknown BullMQ Configuration

**Severity:** MEDIUM  
**Location:** BullMQ queue initialization (not visible in reviewed files)

Missing knowledge:
- Default retry count (infinite? 3? 5?)
- Backoff strategy (exponential? linear? none?)
- Max job execution time
- Stalled job detection interval

**Recommended Action:**
Add constants to `scheduled-tasks.ts`:
```typescript
export const BULLMQ_CONFIG = {
  defaultAttempts: 3,
  defaultBackoff: { type: "exponential", delay: 2000 },
  stalledInterval: 30_000,
  maxStalledCount: 2,
  lockRenewTime: 15_000,
  lockDuration: 30_000,
} as const;
```

### Catch-Up Policy (Good)

The `catchUp` metadata field is well-designed for dropping stale jobs on startup:
```typescript
export function shouldRunNow(taskName, payload, graceMs = 60_000) {
  if (payload.catchUp !== false) return true;
  const overdueBy = Date.now() - payload.scheduledFor;
  if (overdueBy > graceMs) return false; // drop if too late
}
```

**Action:** Verify all scheduled tasks set `catchUp: false` and `scheduledFor` appropriately.

---

## Performance Recommendations by Priority

### P1 (Critical for reliability)
- [ ] Verify PermitResolver doesn't N+1 on multi-target commands
- [ ] Document BullMQ retry configuration and job idempotency
- [ ] Implement scheduler lock to prevent duplicate execution (see concurrency audit)

### P2 (Improves efficiency)
- [ ] Unify cache TTLs and document hierarchy
- [ ] Add `select` clauses to RPC queries (over-fetching)
- [ ] Implement cache invalidation on shard restart with watermark
- [ ] Add rate limiting to RPC actions
- [ ] Implement cleanup for stale Redis keys on guild/user deletion

### P3 (Nice to have)
- [ ] Batch message statistics increments
- [ ] Add Prometheus metrics for cache hit ratio
- [ ] Profile command execution latency by command type
- [ ] Add compression for large RPC responses (GDPR export)

---

## Testing Requirements

Before declaring performance safe:
- [ ] Benchmark: 1000 messages/sec load, verify stats batching doesn't drop
- [ ] Benchmark: 100 concurrent RPC calls, measure 99th percentile latency
- [ ] Benchmark: Case creation race, 100 concurrent creates same guild, verify no duplicates
- [ ] Benchmark: Cache invalidation with 1M keys, measure resync time
- [ ] Load test: 50 shards × 20 commands/sec each = 1000 commands/sec, measure database pool exhaustion

---

## Conclusion

Lumi's architecture is **well-designed for production**. Database queries are efficient, caching is sound, and distributed coordination is mostly safe. The identified issues are **not blockers** but will reduce latency and prevent edge-case bugs under sustained load.

**Recommended:** Address P1 items before significant scale, tackle P2 items in next quarter.

