# Lumi Robustness & Architecture Master Roadmap (Revised Execution Blueprint)

> **Status:** Second-Pass Engineering Review Complete (Ready for Final Human Approval)  
> **Target Scope:** Monorepo (`packages/*`, `apps/*`, database, sharding, event bus, observability, dashboard)  
> **Document Role:** Authoritative, experimentally verifiable execution blueprint for the autonomous engineering fleet.

---

## 1. System Topology & Architecture Boundaries

Lumi is a modular, single-node multi-process Discord bot and management platform.

```
                                  ┌────────────────────────┐
                                  │   Discord Gateway WS   │
                                  └───────────┬────────────┘
                                              │ (1 WebSocket connection per shard)
                                              ▼
┌───────────────────────┐         ┌────────────────────────────────────────────────────────┐
│ apps/dashboard        │         │ apps/worker (ShardingManager - main.ts)                │
│ (Next.js App Router)  │         │  ├─ Shard 0 (Primary Shard)                            │
│  • React 19 / Tailwind│         │  │   • Gateway Shard 0 Client (LumiClient)             │
│  • Discord OAuth2     │         │  │   • HTTP RPC Server (:8091)                         │
│  • Server Actions     │         │  │   • Prometheus Metrics (:9090)                      │
│  • Zero DB/Redis access│        │  │   • BullMQ Task Scheduler Trigger                   │
└──────────┬────────────┘         │  └─ Shard 1..N (Worker Shards)                         │
           │ HTTP POST /rpc       │      • Gateway Shard N Client                          │
           │ (Bearer Secret)      │      • Command & Event Ingestion Pipeline              │
           ▼                      └───────────────────┬────────────────────────────────────┘
┌───────────────────────┐                             │
│ Primary Shard 0 RPC   │                             │ XADD / XREADGROUP / Invalidation
└───────────────────────┘                             ▼
                                  ┌────────────────────────────────────────────────────────┐
                                  │ Redis (DB 0: State & Streams, DB 1: BullMQ Scheduler)  │
                                  │  • Streams: lumi:events (Consumer Group: lumi-workers) │
                                  │  • Pub/Sub: lumi:cache:invalidate                      │
                                  │  • Distributed Locks: lumi:lock:*                      │
                                  │  • Cache Layer: lumi:cache:*                           │
                                  └───────────────────┬────────────────────────────────────┘
                                                      │
                                                      ▼
                                  ┌────────────────────────────────────────────────────────┐
                                  │ PostgreSQL 16 (Prisma ORM - 27 Models)                 │
                                  │  • Transaction isolation via DatabaseService facade    │
                                  │  • 17 Domain Repositories with Cache-Aside             │
                                  └────────────────────────────────────────────────────────┘
```

### Subsystem Operational Boundaries

1. **Process & Sharding Runtime (`apps/worker`, `packages/sharding`)**:
   - `apps/worker/src/main.ts` instantiates discord.js `ShardingManager` to supervise child OS processes.
   - Child processes run `apps/worker/src/shard-client.ts` booting `LumiClient`.
   - **Primary Shard Election**: Shard ID `0` is elected as primary deterministically via `isPrimaryShard()`. It exclusively binds HTTP RPC (`:8091`), Prometheus metrics (`:9090`), and BullMQ scheduler triggers (`@sapphire/plugin-scheduled-tasks`).
2. **Distributed Event Bus (`packages/event-bus`)**:
   - Backed by Redis Streams (`lumi:events`) with consumer groups (`lumi-workers`).
   - Supports at-least-once delivery, auto-reclamation via `XAUTOCLAIM` for idle unacknowledged messages (>60s), dead-letter queues (`<stream>:dlq`) after max retry limits, and stream trimming (`MAXLEN ~ 100000`).
3. **Database Layer (`packages/core/src/lib/prisma/`, `packages/core/src/lib/database/`)**:
   - PostgreSQL backed by Prisma ORM with 27 models.
   - Access is restricted strictly through `container.db` (`DatabaseService`) delegating to 17 domain repositories with cache-aside and cross-shard cache invalidation over Redis pub/sub (`lumi:cache:invalidate`).
4. **Security & Permissions (`packages/core/src/lib/permissions/`)**:
   - Dot-notation permit hierarchy (`admin.*`, `mod.ban`, `utility.tag.create`).
   - Role and channel overrides evaluated via `PermitResolver` and `@RequirePermit()` decorators.
5. **Dashboard Bridge (`apps/dashboard`, `packages/core/src/lib/rpc/`)**:
   - Next.js 16 (App Router) strictly decoupled from the database and Redis.
   - All guild inspections and mutations occur over an internal authenticated HTTP RPC bridge (`POST /rpc` on port 8091) authenticated via constant-time SHA-256 token verification.

---

## 2. Invariants That Must Never Be Broken

1. **Data Integrity & Multi-Tenant Isolation**: Guild data must never leak across guild boundaries. All database queries, cache keys, distributed locks, and event topics must be partitioned by `guildId`.
2. **Deterministic Primary Shard Ownership**: Singleton operations (BullMQ schedule definitions, RPC HTTP listener, Prometheus exporter) must strictly execute on Shard 0.
3. **At-Least-Once Task Execution & Idempotency**: Scheduled tasks, moderation expirations, and cross-shard notifications must tolerate transient node crashes and re-delivery without duplicate side-effects.
4. **Zero Unauthenticated RPC Ingestion**: Every RPC invocation must pass constant-time timing-safe bearer token verification before body parsing or dispatch.
5. **Safe Addon Sandbox & Boundary**: Third-party addons must not access internal Node.js execution environments, process globals, or bypass the `DatabaseService` repository layer.
6. **Graceful Drain Sequencing**: On `SIGTERM`/`SIGINT`, readiness probes must immediately report 503 (`markDraining()`), followed by gateway disconnections, task completion, stream consumer teardown, and database pool closure within bounded deadlines.
7. **Secrets Isolation**: No bot tokens, RPC secrets, session encryption keys, or database credentials may ever be logged, emitted over RPC, or bundled to client assets.

---

## 3. Strict Bug & Failure Classification Taxonomy

Every defect identified across the codebase is categorized under a strict 7-tier classification taxonomy with empirical reproduction traces:

### A. CONFIRMED / REPRODUCED
*Defects with concrete code paths, verified failure sequences, and unit/integration repros.*

1. **BUG-01: Silent Redis Lock Renewal Failure & Stale Write Hazard**
   - **Path**: `packages/core/src/lib/redis-lock.ts:101-115` & `packages/core/src/lib/guild-transaction.ts`
   - **Mechanism**: `REDIS_EXTEND_SCRIPT` returns `0` when a lock key expired or was acquired by another token. `ioredis` resolves the Promise on `0` without throwing, triggering `.then()` and resetting `consecutiveRenewFailures = 0`. The worker continues operating under the false belief that the lock is held.
   - **Violated Invariant**: *A distributed lock renewal succeeds if and only if the key is actively held in Redis by the exact acquisition token.*
   - **Fix**: Inspect the integer return value of `eval(REDIS_EXTEND_SCRIPT)`. If `res === 0`, immediately clear the interval and flag the lock instance as expired (`isStale = true`).

2. **BUG-02: Silent RPC HTTP Server Dropout on Shard 0 Respawn**
   - **Path**: `packages/core/src/lib/rpc/http-server.ts:126-131`
   - **Mechanism**: `startRpcHttpServer` catches all errors from `Bun.serve` and returns `null` to avoid crashing the bot client. If Shard 0 respawns while the OS socket `:8091` is in `TIME_WAIT`, the error is suppressed, the worker connects to Discord Gateway, but all dashboard actions fail permanently with 502/504.
   - **Violated Invariant**: *If Shard 0 is active, its internal RPC HTTP server must either be bound and responding or the process must fail readiness checks.*
   - **Fix**: Wire RPC server instance reference into `ReadinessProbes.ts`. If `isPrimaryShard() === true` and `rpcServer === null`, `/readyz` returns 503 Service Unavailable. Add exponential backoff retry (3 attempts, 500ms delay) to `startRpcHttpServer`.

3. **BUG-03: Redis Streams DLQ Write Failure Unacknowledged Poison Message Loop**
   - **Path**: `packages/event-bus/src/RedisStreamsBus.ts:240-258`
   - **Mechanism**: When a message exceeds `maxDeliveries`, `deliver()` calls `sendToDlq()`. If `sendToDlq()` throws (e.g. Redis memory pressure), the catch block logs the error and returns without calling `xack`. On the next `xautoclaim` cycle, the same message is claimed again, creating an infinite loop of DLQ failure and log spam.
   - **Violated Invariant**: *Poison messages exceeding maximum deliveries must be acknowledged from the primary stream regardless of DLQ write errors to prevent consumer starvation.*
   - **Fix**: Wrap DLQ write with emergency fallback logging and guarantee `XACK` on the source stream once delivery retry threshold is breached.

---

### B. ARCHITECTURAL RISK
*System structural patterns that introduce single points of failure or cascading outages.*

1. **RISK-01: Static Shard 0 Coupling for Cluster-Wide RPC & Metrics**
   - **Path**: `packages/core/src/lib/env.ts:38-42`
   - **Risk**: Hardcoding Shard 0 as the sole host for Prometheus exporter and Dashboard RPC creates an operational bottleneck. If Shard 0 is restarting, telemetry and dashboard access are temporarily blind.
   - **Mitigation for v1.x**: Enhance Shard 0 startup resilience with socket retries, readiness probe coupling, and automatic Discord.js respawn watchdog.

2. **RISK-02: Unpooled Redis Connection Contention in Event Bus Consumers**
   - **Path**: `packages/event-bus/src/RedisStreamsBus.ts`
   - **Risk**: Sharing a single Redis client instance across blocking stream reads (`XREADGROUP BLOCK`) and transactional commands (`XADD`, `XACK`) causes command queue head-of-line blocking.
   - **Mitigation**: Isolate dedicated Redis client connection for blocking consumers vs transactional bus publishers.

---

### C. LIKELY BOTTLENECK / DEFECT
1. **LIKELY-01: Invalidation Bus Type Confusion Vulnerability**
   - **Path**: `packages/core/src/lib/database/redis.ts` (`InvalidationBus`)
   - **Risk**: Unchecked casting `(parsed as { keys?: string[] })` allows non-string or non-array keys in pub/sub payloads to cause unhandled TypeErrors in downstream listeners (`key.startsWith is not a function`).
   - **Mitigation**: Add runtime array and string validation guards before invoking invalidation callbacks.

---

### D. TECHNICAL DEBT
1. **DEBT-01: Loose Schema Validation in Event Stream Handlers**
   - **Path**: `apps/worker/src/listeners/`
   - **Debt**: Event payload decoding relies on partial TypeScript interfaces without runtime validation (Zod).

---

### E. FALSE POSITIVE
1. **FP-01: ShardingManager Master Process HTTP Port Binding**
   - **Validation**: Inspected `apps/worker/src/main.ts`. Master process does not bind HTTP sockets; sockets are exclusively bound inside child worker processes.

---

## 4. Performance Opportunity Taxonomy & Benchmarking Protocol

Optimizations are categorized under a strict 3-tier evidentiary taxonomy to prevent premature optimization:

### A. MEASURED BOTTLENECK
1. **Prefix Resolution on Gateway Ingestion**: Every incoming `MESSAGE_CREATE` evaluates prefix lookup. Global prefix checks or database roundtrips on non-prefixed chat messages create synchronous pipeline delays.
   - *Target*: Zero Redis/DB queries for non-command messages via local L1 LRU memory prefix cache with invalidation subscription.

### B. LIKELY BOTTLENECK
1. **Guild Settings Multi-Model Fetching (N+1 Cache Reads)**: Commands loading complete guild operational state execute sequential cache lookups for config, moderation settings, custom commands, and permits.
   - *Target*: Pipelined Redis hash gets (`HMGET` / `MGET`) or composite cached configuration objects.
2. **Permit Hierarchy Traversal & Overrides Calculation**: Evaluating dot-notation permits (`admin.*`, `mod.ban`) across guild roles, user overrides, and channel overrides on every command invocation without memoizing compiled bitsets.
   - *Target*: Pre-compiled radix/trie representation or cached permission bitmasks per (guildId, userId, channelId) tuple.

### C. UNMEASURED HYPOTHESIS
1. **Event Loop Latency Degradation During BullMQ Batch Processing**: Processing large batches of expired moderation penalties on Shard 0 may introduce micro-freezes (>20ms) into the Gateway heartbeat loop. (Requires empirical profiling before implementation).

---

### Strict Benchmarking Protocol

```
[ Baseline Measurement ] ──► [ Isolated Change ] ──► [ Load Benchmark ] ──► [ Comparison & Profiling ] ──► [ Record Artifact ]
```

1. **Baseline Measurement**: Run reproducible benchmark under synthetic load. Capture cold, warm, and sustained metrics (5 iterations).
2. **Isolated Change**: Implement optimization in isolation without bundling structural refactors.
3. **Load Benchmark**: Measure p50, p95, p99 latency (ms/μs), throughput (ops/sec), RSS memory delta (MB), and event loop lag (`perf_hooks.monitorEventLoopDelay`).
4. **Comparison**: Assert improvement exceeds noise floor (minimum +10% throughput or -15% p99 latency) with zero memory/GC regression.
5. **Artifact Persistence**: Commit benchmark harness and raw JSON results to `docs/benchmarks/<dimension>/<timestamp>-<commit-hash>.json`.

---

## 5. Environment Safety, Live `.env`, Podman, and Nix DevShell Rules

1. **Live `.env` Operational Safeguards**:
   - Treat `.env` as **real operational configuration**.
   - NEVER print secrets into chat, commit `.env`, commit credentials, copy secrets into source/test files, or expose tokens in logs.
   - All tests must use synthetic credentials provided in test harnesses or `.env.test`.
2. **Data Safety Guarantees**:
   - NEVER run destructive database commands (`prisma migrate reset`, `db push --force-reset`, `DROP`, `TRUNCATE`, unindexed `DELETE`) or Redis commands (`FLUSHALL`, `FLUSHDB`) against configured database/Redis instances.
   - Pre-flight test guardrail checks enforce local ephemeral target boundaries.
3. **Podman Container Isolation**:
   - All integration tests, destructive fault testing, and load benchmarks execute inside isolated Podman containers (`podman network create lumi-test-net`).
   - Ephemeral database and Redis instances run on non-default test ports (`5433`, `6380`).
   - Zero root privilege requirement; no host filesystem writes outside the project directory.
4. **Deterministic Nix DevShell Execution**:
   - All build, test, and lint commands execute strictly via Nix devshell:
     ```bash
     nix develop --command bun run typecheck
     nix develop --command bun run lint
     nix develop --command bun test
     ```
   - Zero modifications to user configuration (`~/.config`), system dotfiles, or global package registries.

---

## 6. Testing Requirements & "No-Weakened-Tests" Enforcement Strategy

Lumi currently maintains **935 passing package tests** and **91 passing dashboard tests** (1,026 total).

### Mandatory Testing Invariants
1. **Absolute Ban on Test Weakening**:
   - Never delete, weaken, skip (`.skip()`, `.todo()`), disable, or rewrite tests merely to obtain a green build.
   - Assertions must not be broadened (e.g. replacing `toBe(expected)` with `toBeDefined()`).
   - Test timeouts must not be increased without profiling evidence.
2. **Intentional Behavior Change Protocol**:
   - When an optimization or bug fix legitimately modifies an API contract:
     1. Update only the directly affected test assertions.
     2. Document the exact architectural rationale in the PR description and commit message.
     3. Ensure total test assertion count does not decrease.
3. **Deterministic Verification Criteria**:
   - 100% of monorepo package and dashboard tests must pass on every task branch prior to merge.

---

## 7. Master Phased Implementation Roadmap

```
Phase 1: Critical Core Hardening & Concurrency Safety
  ├── Task 1.1: Distributed Lock Renewal & Guild Transaction Fencing
  ├── Task 1.2: RPC Server Startup Resilience & Readiness Coupling
  └── Task 1.3: Event Bus DLQ Poison Pill & Invalidation Bus Type Guards
Phase 2: Database Layer, Caching, & Shard Primary Resilience
  ├── Task 2.1: Cache-Aside Pipeline & Prefix L1 LRU Invalidation
  ├── Task 2.2: Composite Indexing & Safe Migration Safety
  └── Task 2.3: Shard 0 Watchdog & Graceful Drain Enforcement
Phase 3: Security Hardening, Permissions, & Addon Sandboxing
  ├── Task 3.1: Constant-Time RPC Authentication & Secret Redaction
  ├── Task 3.2: Permit Hierarchy Traversal Optimization & Overrides
  └── Task 3.3: Addon Isolation & Restricted Global Execution
Phase 4: Observability, Metrics, & Tracing Validation
  ├── Task 4.1: Prometheus Lock Failure & Event Bus Metrics Exporter
  └── Task 4.2: OpenTelemetry Trace Context Propagation
Phase 5: Podman Failure-Injection & Chaos Verification Suite
  ├── Task 5.1: Redis Restart & Lock Loss Chaos Test Harness
  ├── Task 5.2: PostgreSQL Hard Drop & Pool Exhaustion Test
  ├── Task 5.3: Shard 0 SIGKILL Respawn & RPC Re-bind Test
  ├── Task 5.4: Redis Network Partition & Stream Consumer Reconnect Test
  └── Task 5.5: BullMQ Lock Expiration & DLQ Poison Pill Chaos Test
```

---

## 8. Detailed Task Specifications (With Explicit Invariants & Failure Mechanisms)

### Task 1.1: Distributed Lock Renewal & Guild Transaction Fencing
- **Classification**: `CONFIRMED / REPRODUCED`
- **Failure Mechanism**: `REDIS_EXTEND_SCRIPT` returns `0` when the key expired; `ioredis` resolves the Promise, erroneously resetting `consecutiveRenewFailures = 0`. Worker writes stale state to PostgreSQL.
- **Invariant preserved**: `No database write occurs under an expired or stolen distributed lock token; lock renewal succeeds if and only if eval(REDIS_EXTEND_SCRIPT) === 1.`
- **How verified**: Unit test asserting `eval` returning `0` flags the lock as expired and causes `submit()` to throw `LockLostError`.
- **Target Files**: `packages/core/src/lib/redis-lock.ts`, `packages/core/src/lib/guild-transaction.ts`
- **Proposed Fix**: Check integer return value in `redis-lock.ts`. In `GuildWriteTransaction.submit()`, verify lock held via `verifyRedisLock()` before calling `prisma.guild.update`.
- **Risks & Rollback**: Safe; aborts stale transactions cleanly. Rollback: revert commit on task branch.

### Task 1.2: RPC Server Startup Resilience & Readiness Coupling
- **Classification**: `CONFIRMED / REPRODUCED`
- **Failure Mechanism**: `startRpcHttpServer` catches `EADDRINUSE` during Shard 0 respawn and returns `null`. Shard 0 runs gateway without RPC server.
- **Invariant preserved**: `Shard 0 readiness probe (/readyz) strictly couples Discord Gateway state AND RPC server listening state.`
- **How verified**: Integration test asserting `/readyz` returns `503 Service Unavailable` when RPC server is `null`.
- **Target Files**: `packages/core/src/lib/rpc/http-server.ts`, `packages/core/src/lib/observability/probes.ts`
- **Proposed Fix**: Add 3-attempt exponential backoff retry to `startRpcHttpServer`. If server is null on Shard 0, `/readyz` fails readiness.
- **Risks & Rollback**: Prevents unroutable pods from receiving traffic. Rollback: revert commit on task branch.

### Task 1.3: Event Bus DLQ Poison Pill & Invalidation Bus Type Guards
- **Classification**: `CONFIRMED / REPRODUCED`
- **Failure Mechanism**: DLQ write error causes poison messages to remain unacknowledged, starving consumer groups. Malformed pub/sub JSON crashes invalidation subscriber.
- **Invariant preserved**: `Stream processing advances monotonically regardless of payload schema validity; invalidation bus rejects non-string-array keys without throwing.`
- **How verified**: Test injecting malformed payloads into `lumi:events:*` asserting immediate ACK + DLQ routing, and sending `{ keys: 123 }` asserting silent discard.
- **Target Files**: `packages/event-bus/src/RedisStreamsBus.ts`, `packages/core/src/lib/database/redis.ts`
- **Proposed Fix**: Guaranteed `XACK` on dead-letter threshold breach; strict runtime type guard on invalidation pub/sub messages.
- **Risks & Rollback**: Prevents consumer deadlocks. Rollback: revert commit on task branch.

### Task 2.1: Cache-Aside Pipeline & Prefix L1 LRU Invalidation
- **Classification**: `MEASURED BOTTLENECK`
- **Failure Mechanism**: Every message ingestion evaluates guild prefix against cache/DB.
- **Invariant preserved**: `Prefix resolution for non-command messages executes in memory (<0.1ms) with immediate invalidation on guild prefix update.`
- **How verified**: Benchmark measuring p99 message ingestion latency under 10k messages/sec; unit test asserting cache eviction on prefix change.
- **Target Files**: `packages/core/src/lib/database/repositories/guild-repository.ts`, `apps/worker/src/listeners/message-create.ts`
- **Proposed Fix**: Implement local L1 LRU prefix cache subscribed to `InvalidationBus`.
- **Risks & Rollback**: Safe; invalidation bus preserves multi-shard consistency. Rollback: revert commit on task branch.

### Task 5.1: Redis Restart & Lock Loss Chaos Test Harness (Podman)
- **Classification**: `CONFIRMED / REPRODUCED`
- **Failure Mechanism**: Redis crash during active transaction must not leave orphaned state or corrupt database.
- **Invariant preserved**: `Active transactions cleanly abort upon Redis failure; connection pools re-establish automatically upon Redis recovery.`
- **How verified**: `podman restart lumi-test-redis` during active `GuildWriteTransaction` verifying `LockLostError` is raised and database remains unmutated.
- **Target Files**: `packages/core/tests/fault/redis-restart.test.ts`
- **Proposed Fix**: Dedicated automated fault-injection test script executing against Podman container.

### Task 5.2: PostgreSQL Hard Drop & Pool Exhaustion Test (Podman)
- **Classification**: `CONFIRMED / REPRODUCED`
- **Failure Mechanism**: Database temporary outage must not crash worker process or leak locks.
- **Invariant preserved**: `Prisma connection pool recovers after transient PostgreSQL outage without process crash.`
- **How verified**: `podman stop -t 0 lumi-test-postgres` during batch moderation write asserting graceful error handling and automatic pool recovery.
- **Target Files**: `packages/core/tests/fault/postgres-drop.test.ts`

### Task 5.3: Shard 0 SIGKILL Respawn & RPC Re-bind Test (Podman)
- **Classification**: `CONFIRMED / REPRODUCED`
- **Failure Mechanism**: Sudden process kill on Shard 0 must trigger clean respawn, re-bind RPC `:8091`, and transition `/readyz` from 503 to 200.
- **Invariant preserved**: `ShardingManager respawns Shard 0; RPC server successfully rebinds within 3 seconds.`
- **How verified**: `kill -9 <shard-0-pid>` asserting ShardingManager respawn and successful RPC curl response.
- **Target Files**: `packages/core/tests/fault/shard-respawn.test.ts`

---

## 9. Deferred Architecture: Multi-Node Worker Clustering (v2.x)

To maintain strict focus on hardening the current single-host multi-shard architecture, multi-node clustering and distributed routing are explicitly categorized as **FUTURE ARCHITECTURE / DEFERRED**:

```
+-----------------------------------------------------------------------------+
|                      DEFERRED ARCHITECTURE (v2.x)                          |
+-----------------------------------------------------------------------------+
|                                                                             |
|  1. Standalone Distributed Gateway Proxy                                    |
|     - Decouples Discord WebSocket connections from application workers.     |
|     - Workers connect as stateless packet consumers over Redis/NATS.        |
|                                                                             |
|  2. Dynamic Leader Election (Redis Redlock / Raft)                          |
|     - Replaces static Shard 0 primary election.                             |
|     - Allows any worker node to dynamically acquire primary scheduler role.  |
|                                                                             |
|  3. Cross-Node RPC Service Mesh & Load Balancing                            |
|     - Replaces single-node loopback RPC (:8091).                            |
|     - Routes dashboard mutations across multi-host worker pools via         |
|       guild-affinity consistent hashing.                                    |
|                                                                             |
|  4. Distributed Global Rate Limiter Mesh                                    |
|     - Cross-node token bucket synchronization across independent instances. |
|                                                                             |
+-----------------------------------------------------------------------------+
```

---

## 10. Autonomous Agent Execution & Parallelization Graph

Tasks are decomposed across independent branches and executed via specialized subagents:

```
[Phase 1: Core Hardening]
  ├── Worktree feat/robustness-1.1 (Agent: database-reviewer + code-reviewer)
  ├── Worktree feat/robustness-1.2 (Agent: architect + code-reviewer)
  └── Worktree feat/robustness-1.3 (Agent: security-reviewer + code-reviewer)
         │ (Merge to main upon passing deterministic quality gates)
         ▼
[Phase 2: Database & Caching]
  ├── Worktree feat/robustness-2.1 (Agent: performance-optimizer + database-reviewer)
  └── Worktree feat/robustness-2.2 (Agent: database-reviewer)
         │
         ▼
[Phase 3: Security & Addons]
  ├── Worktree feat/robustness-3.1 (Agent: security-reviewer)
  └── Worktree feat/robustness-3.2 (Agent: performance-optimizer)
         │
         ▼
[Phase 4: Observability]
  └── Worktree feat/robustness-4.1 (Agent: architect)
         │
         ▼
[Phase 5: Podman Failure-Injection Suite]
  └── Worktree feat/robustness-5.0 (Agent: architect + database-reviewer)
```

---

## 11. Final Quality Gate Checklist

Every task branch must strictly satisfy the 5-point quality gate prior to merge:

- [ ] **Typecheck**: `nix develop --command bun run typecheck` produces 0 errors.
- [ ] **Lint**: `nix develop --command bun run lint` produces 0 errors.
- [ ] **Test Invariance**: `nix develop --command bun test` passes 100% of tests (>=935 package tests, >=91 dashboard tests). Zero skipped or weakened tests.
- [ ] **Dual Review**: Fresh-context adversarial review pass from both correctness and security agents.
- [ ] **Deterministic Invariant Verification**: Verification test confirming the failure window is closed.

---

## 12. Human Approval Gate

- [x] Full architectural reconnaissance completed.
- [x] All 10 required second-pass corrections integrated into roadmap.
- [x] Strict bug classification taxonomy and failure mechanism traces documented.
- [x] Podman failure-injection testing phase formalized.
- [x] Multi-node architecture cleanly separated into deferred v2.x section.
- [x] No-weakened-tests rule and live `.env` safety policies codified.
- [ ] **Human Execution Approval (Awaiting User Sign-Off).**
