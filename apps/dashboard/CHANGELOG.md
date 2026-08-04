# @lumi/dashboard

## 3.0.0

### Patch Changes

- 455d5f8: Bug-fix batch: quarantine cases now record `quarantine`/`unquarantine` actions (fixing the dead rejoin re-enforcement DB fallback) and lift stale cases on apply/undo; repository `getOrSet` gains single-flight dedup and no longer caches `undefined`; GUILD_CREATE entity-cache writes are pipelined instead of sequential; RabbitMQ `publishEvent` catches and logs publish failures centrally; empty catch blocks now log at debug; the unused `TRANSPORT` env var and dead `RestrictAction`/`BaseAction` scaffolding are removed; the `INTERACTION_DEFER_AT_GATEWAY` env var is removed (interactions are deferred in-process).
- 5d96c1b: Bug-fix batch from an architecture review: symlink install no longer crashes on a dangling target; `ping`/`telemetryStats` clean up their intervals and REST listeners on unload; `InvalidationBus` now does a full resync when its Redis subscriber reconnects after a dropped connection, and `ModuleStore`/`TempVcRegistry` consume it; cache invalidation gets a delayed double-delete to close the stale-write race; sharding's `reconcileAssignment` re-reads the assignment after acquiring the leader lock to close a split-brain window; `ClusterReadyTracker` is now per-replica instead of a single global key; `RedisSessionStore.flush()` restores unflushed entries on a failed pipeline instead of losing them; `RedisIdentifyThrottler` no longer sleeps 250ms when a bucket lock is already free; dashboard RPC mutation handlers re-validate the actor's live Discord permissions instead of trusting the (up to 8h stale) session; the RabbitMQ RPC bridge nacks malformed messages and always replies on handler failure instead of leaving the dashboard caller to time out, and the dashboard RPC client no longer leaks its timer/listener on a synchronous send failure; `RedisStreamsBus` still acks a poison message if publishing it to the DLQ fails, instead of retrying it forever; `GuildWriteTransaction`'s `Symbol.dispose` logs release failures instead of swallowing them; `SecurityService`'s anti-nuke/raid rate limiters increment and set their TTL atomically, and `grantVerified` swaps roles in one call instead of leaving a member stuck with both roles if the second call fails.
- Updated dependencies [70337e8]
- Updated dependencies [27d4684]
- Updated dependencies [70337e8]
  - @lumi/observability@3.0.0
  - @lumi/contracts@3.0.0

## 1.0.1

### Patch Changes

- 40741cc: Add project hygiene, Changesets release automation, pre-commit hooks, and documentation fact-checking across workspace packages.
- Updated dependencies [40741cc]
  - @lumi/observability@1.0.1
  - @lumi/contracts@1.0.1
