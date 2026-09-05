# Concurrency & Distributed System Audit Report - Lumi

**Date:** September 3, 2026  
**Scope:** Wave 8 - Sharding, distributed coordination, transaction safety  
**Verdict:** Architecture is sound; critical fixes needed for production reliability

---

## Overview

Lumi runs as a **multi-shard distributed system** where:
- Multiple processes share one PostgreSQL database and one Redis instance
- One process (holding shard 0) owns the job queue and RPC server
- Other processes own Discord gateway connections
- All processes must coordinate cache invalidation and scheduled tasks

**Critical Issues Found:**
1. **No lock on primary shard** — if two processes both calculate `isPrimaryShard()` as true, both will execute scheduled tasks, causing duplicates
2. **Case creation race condition** — under high concurrency, two shards could create cases with the same number
3. **Cache invalidation race on reconnect** — if Redis disconnects, shards may miss invalidations for up to 2 seconds

**Severity:** These issues are unlikely to occur in single-shard development but **will occur in production** with multiple shards or under failure scenarios.

---

## 1. Sharding Architecture

### Primary Shard Model

Only process holding **shard 0** (determined by `isPrimaryShard()`) owns:
- HTTP RPC server (port binding)
- Prometheus metrics
- BullMQ task queue + worker
- Task fire handlers
- Addon/module management

Other shards own Discord gateway connections only.

**Code locations:**
- `packages/core/src/lib/env.ts::isPrimaryShard()`
- `packages/core/src/lib/client/LumiClient.ts::login()` (primary-only startup)
- `packages/core/src/lib/client/container-services.ts` (container setup)

### Architecture Diagram

```
Developer Laptop (SHARD_COUNT=1)
  └─ Process A
      ├─ Shard 0
      ├─ RPC Server ✓
      ├─ BullMQ ✓
      └─ isPrimaryShard() = true

Production (SHARD_COUNT=10, ShardingManager)
  ├─ Process A (SHARDS=[0,1,2])
  │   ├─ RPC Server ✓
  │   ├─ BullMQ ✓
  │   └─ isPrimaryShard() = true (has shard 0)
  │
  ├─ Process B (SHARDS=[3,4,5])
  │   └─ isPrimaryShard() = false
  │
  └─ Process C (SHARDS=[6,7,8,9])
      └─ isPrimaryShard() = false
```

---

## 2. Critical Issue: Primary Shard Race Condition

### Issue Description

**Severity:** HIGH  
**Type:** Race condition  
**Impact:** Duplicate scheduled task execution (mute expiry, config cleanup, etc.)

When a primary shard dies, ShardingManager restarts it in a new process. But no lock exists to prevent two processes claiming primary simultaneously.

**Scenario:**

```
T=0:   Process A (shard 0) crashes
T=1:   ShardingManager detects crash
T=2:   ShardingManager spawns Process B with shard 0
T=3:   Process B calculates isPrimaryShard() → true
T=4:   Process B starts RPC server + BullMQ
       BUT: Process A is hung (not dead), still has stale shard 0 reference
T=5:   Both Process A and B execute scheduled tasks
T=6:   Case lift job runs twice, errors on second attempt
```

**Code (current - vulnerable):**

```typescript
// From LumiClient.ts
if (isPrimaryShard()) {
  // No lock! If another shard thinks it's primary, both run this
  initCoreRpcHandlers();
  this._rpcServer = await startRpcHttpServer(...);
  // BullMQ worker starts, will execute duplicate tasks
}
```

### Fix (Required)

Add Redis-based exclusive lock:

```typescript
if (isPrimaryShard()) {
  // Acquire exclusive scheduler lock
  const lockKey = "lumi:scheduler:lock";
  const consumerId = getConsumerId();
  
  // Set with NX (only if doesn't exist) and PX (TTL)
  const acquired = await container.redis.set(
    lockKey,
    consumerId,
    "PX", 30_000, // 30 second TTL
    "NX" // only set if key doesn't exist
  );
  
  if (acquired !== "OK") {
    const holder = await container.redis.get(lockKey);
    throw new Error(
      `[Primary] Failed to acquire scheduler lock. ` +
      `Current holder: ${holder}, this process: ${consumerId}`
    );
  }
  
  container.logger.info(
    `[Primary] Acquired scheduler lock (consumer=${consumerId})`
  );
  
  // Initialize primary-only services
  initCoreRpcHandlers();
  this._rpcServer = await startRpcHttpServer(...);
  
  // Renew lock every 10 seconds to detect process death
  setInterval(async () => {
    const renewed = await container.redis.set(
      lockKey,
      consumerId,
      "PX", 30_000,
      "XX" // only update if exists
    );
    if (renewed !== "OK") {
      container.logger.error("[Primary] Lost scheduler lock, exiting");
      process.exit(1);
    }
  }, 10_000);
}
```

**Effect:**
- Process A: acquires lock successfully
- Process B: fails to acquire lock, throws error, exits
- If Process A dies, lock expires after 30s, Process B acquires it on next check
- Graceful failover within 30 seconds

**Recommended deadline:** Implement before supporting multiple shards in production.

---

## 3. Database Transaction Safety

### Issue 1: Case Number Duplicates Under Concurrency

**Severity:** MEDIUM  
**Type:** Race condition  
**Impact:** Two cases created with same case number in same guild

**Current Code (problematic):**

```typescript
// ModerationRepository.createModerationCase()
return this.prisma.$transaction(async (tx) => {
  // Find highest case number
  const maxCase = await tx.moderationCase.findFirst({
    where: { guildId },
    orderBy: { caseNumber: "desc" },
    select: { caseNumber: true }
  });
  const maxNum = maxCase?.caseNumber ?? 0;

  // Increment counter
  const counter = await tx.guildCaseCounter.upsert({
    where: { guildId },
    create: { guildId, next: maxNum + 2 },
    update: { next: { increment: 1 } }
  });

  // Assign case number
  const caseNumber = Math.max(counter.next - 1, maxNum + 1);
  if (caseNumber >= counter.next) {
    await tx.guildCaseCounter.update({...});
  }

  // Create case
  return tx.moderationCase.create({data: {..., caseNumber}});
});
```

**Problem:** Transaction uses default isolation level (Read Committed). Under high concurrency:

```
T=0:   Tx1 reads maxCase = 10
T=0:   Tx2 reads maxCase = 10
T=1:   Tx1 increments counter: 1 → 2
T=2:   Tx2 increments counter: 2 → 3
T=3:   Tx1 uses caseNumber = max(1, 11) = 11 ✓
T=4:   Tx2 uses caseNumber = max(2, 11) = 11 ✗ (collision!)
T=5:   Both create case 11 → database unique constraint violation
```

**Result:**
- One transaction commits case 11
- Other transaction gets error and user sees "failed to create case"
- User retries and gets case 12 (gap in numbering)

**Fix (Required):**

Use Serializable isolation:

```typescript
return this.prisma.$transaction(
  async (tx) => {
    // ... same code as above
  },
  {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable
  }
);
```

**Effect:**
- Tx1 acquires range lock on cases
- Tx2 waits for Tx1 to commit
- Both transactions see consistent case number sequence
- No collision possible

**Recommended deadline:** Implement before supporting high-concurrency moderation (P1).

### Issue 2: Good Patterns (No Action Needed)

**Permit assignments:** Uses UPSERT on unique constraint, which is atomic regardless of isolation level:
```typescript
await tx.permitAssignment.upsert({
  where: { uq_permit_assignment: {permitId, targetType, targetId} },
  create: {...},
  update: {...}
});
```

**Module config updates:** Upsert on composite primary key, atomic and safe.

**Guild/user anonymization (GDPR):** Uses multiple updateMany with idempotent data ("0"), safe under any isolation level.

---

## 4. Cache Invalidation Race Conditions

### Issue 1: Invalidation Lost on Shard Restart

**Severity:** MEDIUM  
**Type:** Timing race  
**Impact:** Shard serves stale cache for up to 2 seconds after restart

**Scenario:**

```
T=0:   Shard A updates guild config in database
T=1:   Shard A publishes invalidation to Redis channel
T=2:   Shard B (secondary) disconnects from Redis due to network blip
T=3:   Shard B reconnects (default 2s reconnect backoff)
T=4:   Shard B has stale config in cache for next 120s (TTL timeout)
T=120: Shard B's cache expires, re-fetches fresh data
```

**Current Code (allows race):**

```typescript
// InvalidationBus.ts
#onClose = () => {
  if (this.#started) this.#connectionDropped = true;
};

#onReady = () => {
  if (!this.#connectionDropped) return;
  this.#connectionDropped = false;
  // Re-run all resync handlers
  for (const fn of this.#resyncListeners) {
    Promise.resolve(fn()).catch(...);
  }
};
```

**Problem:** Between `#onClose` and `#onReady`, invalidations published are not received. No backlog retrieval.

**Recommended Fix:**

Track invalidation watermark:

```typescript
#lastInvalidationTime = 0;

#onMessage = (_channel: string, payload: string) => {
  const parsed = tryParseJSON(payload) as 
    { keys?: unknown, time?: number } | null;
  
  if (parsed?.time) {
    this.#lastInvalidationTime = parsed.time;
  }
  // ... apply invalidation
};

async #doResync() {
  // Force re-fetch all keys modified since disconnect
  const cutoff = this.#lastInvalidationTime;
  for (const resync of this.#resyncListeners) {
    await resync({ cutoff });
  }
}
```

**Effect:**
- Shard reconnects and resync fetches only recently-changed keys
- Avoids hammering database with 1M+ key re-fetches
- Stale-data window is bounded by max(cache TTL, resync latency)

### Issue 2: Cache Coherence Without Watermark

**Severity:** LOW  
**Type:** Correctness  
**Impact:** Possible inconsistency between related cache entries

If config cache (60s) and permission cache (120s) are invalidated together, but resync on shard restart doesn't know they're related:

```
T=0:   Invalidate both config and perms
T=2:   Shard reconnects, resyncs config (TTL expired) ✓
T=2:   But perms still cached (120s > 60s elapsed) ✗
T=120: Perms finally expire
→ 120s window where config is fresh but perms are stale
```

**Fix:** Invalidation message includes all affected cache types:

```typescript
await container.redis.publish(
  INVALIDATION_CHANNEL,
  JSON.stringify({
    keys: ["config:...", "perms:..."],
    types: ["CONFIG", "PERMISSIONS"],
    time: Date.now()
  })
);
```

**Effect:** Resync knows to invalidate both categories together.

---

## 5. Scheduled Task Idempotency & Retries

### Issue: Unknown BullMQ Configuration

**Severity:** MEDIUM  
**Type:** Unknown behavior  
**Impact:** Task retry behavior could cause duplicates or data loss

**Unknown:**
- Default retry count for failed jobs
- Backoff strategy (exponential, linear, none)
- Max execution time per job
- Whether failed jobs are logged

**Examples to Verify:**

**Case Lift (Idempotent - Safe):**
```typescript
// If runs twice, second run finds case.active = false, skips ✓
queue.add("case-lift", { caseId }, { attempts: 3, backoff: "exponential" });
```

**Config Cleanup (Idempotent - Safe):**
```typescript
// If runs twice, second delete finds no matches ✓
queue.add("cleanup-old-configs", { guildId }, { attempts: 3 });
```

**Audit Log Rotation (NOT Idempotent - Risky):**
```typescript
// If runs twice, archives same logs twice → duplicates ✗
queue.add("rotate-audit-logs", { guildId }, { attempts: 1, removeOnFail: true });
```

**Recommended Action:**

Add to `scheduled-tasks.ts`:

```typescript
/**
 * BullMQ job configuration constants. Every scheduled task must declare
 * whether it's safe to retry and how to configure its queue.
 */
export const BULLMQ_CONFIG = {
  /** Retry configuration for idempotent jobs (safe to run multiple times) */
  idempotent: {
    attempts: 3,
    backoff: { type: "exponential" as const, delay: 2000 },
    removeOnComplete: true,
    removeOnFail: false
  },
  /** Retry configuration for jobs that must run exactly once */
  exact: {
    attempts: 1,
    backoff: { type: "fixed" as const, delay: 0 },
    removeOnComplete: true,
    removeOnFail: false
  }
} as const;

/**
 * Audit: Which scheduled tasks are idempotent?
 * - case-lift: YES (update active=false is idempotent)
 * - config-cleanup: YES (delete already-deleted rows is no-op)
 * - audit-rotate: NO (duplicate log rotations cause duplicates)
 * - ... (document all)
 */
```

---

## 6. RPC Server Safety

### Issue: No Audit Logging

**Severity:** MEDIUM  
**Type:** Observability  
**Impact:** Cannot debug who made which RPC call

RPC calls are authenticated by static `RPC_INTERNAL_TOKEN` but not audited per caller.

**Recommended Fix:**

```typescript
// In http-server.ts (RPC dispatch)
const audit = {
  timestamp: new Date(),
  action: req.action,
  actorId: req.actorId,
  clientIp: req.headers["x-forwarded-for"] || req.socket.remoteAddress,
  success: !response.error,
  duration: endTime - startTime,
  dataSize: JSON.stringify(response).length
};

// Log to database
await container.db.audit.create({ data: audit });

// Alert on suspicious patterns
if (audit.duration > 5000) {
  container.logger.warn(`[RPC] Slow call: ${req.action} took ${audit.duration}ms`);
}
```

---

## 7. Graceful Shutdown

### Issue: Unknown Shutdown Behavior

**Severity:** MEDIUM  
**Type:** Operational  
**Impact:** Stale locks, connection leaks on crash

No visible SIGTERM handler to clean up gracefully.

**Recommended Fix:**

```typescript
// In LumiClient.ts or main.ts
process.on("SIGTERM", async () => {
  container.logger.info("[Shutdown] Received SIGTERM, gracefully shutting down...");
  
  try {
    // Step 1: Stop accepting new work
    container.logger.info("[Shutdown] Stopping Discord client...");
    client.destroy();
    
    // Step 2: Wait for in-flight work
    container.logger.info("[Shutdown] Closing RPC server...");
    if (rpcServer) await rpcServer.close();
    
    if (bullWorker) {
      container.logger.info("[Shutdown] Closing BullMQ worker...");
      await bullWorker.close();
    }
    
    // Step 3: Release locks
    if (isPrimaryShard()) {
      container.logger.info("[Shutdown] Releasing scheduler lock...");
      await container.redis.del("lumi:scheduler:lock");
    }
    
    // Step 4: Close connections
    container.logger.info("[Shutdown] Closing database...");
    await container.prisma.$disconnect();
    
    container.logger.info("[Shutdown] Closing Redis...");
    await container.redis.quit();
    
    container.logger.info("[Shutdown] Goodbye.");
    process.exit(0);
  } catch (err) {
    container.logger.error("[Shutdown] Error during shutdown:", err);
    process.exit(1);
  }
});

// Don't hang on uncaught exceptions
process.on("uncaughtException", async (err) => {
  container.logger.error("[Fatal] Uncaught exception:", err);
  await new Promise(resolve => {
    container.redis.del("lumi:scheduler:lock").finally(resolve);
  });
  process.exit(1);
});
```

---

## 8. Event Listener Distribution

### Unknown: Cross-Shard Event Propagation

**Question:** Are module event listeners local or distributed?

Example:
```typescript
// Does this fire on all shards or just primary?
emitter.on("case-created", handler);
```

If events are pub/sub'd via Redis, ordering is not guaranteed across shards.

**Recommended:** Document explicitly in module SDK.

---

## Verification Checklist

Before deploying with multiple shards, verify:

### Scheduler Lock
- [ ] Two processes start with shard 0 in both
- [ ] Only one successfully acquires lock
- [ ] Other exits with error
- [ ] If lock holder dies, other acquires it within 30s

### Database Concurrency
- [ ] Run 100 concurrent case creation jobs for same guild
- [ ] Verify all case numbers are unique
- [ ] Verify numbering is contiguous (no gaps)

### Cache Invalidation
- [ ] Redis disconnects for 5s
- [ ] Shard reconnects and resync completes
- [ ] Verify all keys are refreshed (sample 10 random keys)

### Graceful Shutdown
- [ ] Send SIGTERM to process
- [ ] Verify scheduler lock released within 1s
- [ ] Verify RPC server closed
- [ ] Verify database connections closed
- [ ] Verify no stray processes or resource leaks

### Job Idempotency
- [ ] Manually trigger job failure mid-execution
- [ ] Verify retry completes successfully
- [ ] Verify no duplicate side effects

---

## Summary Table: Concurrency Issues

| Issue | Severity | Type | Fix Deadline | Effort |
|-------|----------|------|--------------|--------|
| Primary shard race (no lock) | HIGH | Race | Before multi-shard prod | 2h |
| Case number duplicate race | MEDIUM | Race | Before multi-shard prod | 1h |
| Cache invalidation on reconnect | MEDIUM | Correctness | Next sprint | 4h |
| Unknown BullMQ config | MEDIUM | Unknown | Next sprint | 2h |
| RPC audit logging | MEDIUM | Observability | Next sprint | 3h |
| Graceful shutdown | MEDIUM | Operational | Next sprint | 2h |
| Event distribution doc | LOW | Documentation | Soon | 1h |
| Cache coherence (related TTLs) | LOW | Correctness | Nice-to-have | 2h |

---

## Recommendations

**Before Production Multi-Shard (P1):**
1. Implement scheduler lock (prevent duplicate execution)
2. Add Serializable isolation to case creation (prevent number collision)
3. Add startup validation (verify lock acquisition on primary, verify database connectivity)

**Next Sprint (P2):**
1. Add cache invalidation watermark (prevent resync thundering herd)
2. Document BullMQ configuration and audit job idempotency per task
3. Add RPC audit logging (who called what when)
4. Implement graceful SIGTERM shutdown

**Nice-to-Have (P3):**
1. Formalize event distribution semantics (local vs. global)
2. Reduce cache TTLs for critical data (config, permissions)
3. Add distributed tracing for cross-shard requests

---

## References

- **Distributed Locking:** Redis Redlock pattern (Redis Cluster safe)
- **Transaction Isolation:** PostgreSQL documentation on isolation levels
- **Cache Coherence:** Cache invalidation distributed systems patterns
- **Job Queues:** BullMQ documentation and idempotency patterns

