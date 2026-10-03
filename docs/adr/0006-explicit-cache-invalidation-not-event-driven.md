# 0006: Cache invalidation stays explicit via `InvalidationBus`, not event-driven

Status: Accepted

## Context

Guild config/module-enabled state is cached in Redis and read across
multiple processes (worker shards, `apps/api`, `apps/scheduler`). A write
from any one of them has to invalidate every other process's local view.
Wiring that through the same event bus used for dashboard UI hints (ADR 0005)
would tie a correctness-critical mechanism to a best-effort, at-most-once
delivery channel — exactly the property that channel is not allowed to have.

## Decision

Cache invalidation goes through `InvalidationBus`
(`packages/core/src/lib/database/redis.ts`), a dedicated Redis pub/sub
channel (`InvalidationChannel`) separate from the dashboard event stream.
`invalidate(...keys)` deletes locally and broadcasts to peers in the same
call; every process subscribes via `onInvalidate()`/`onResync()` and reacts
synchronously. Call sites never reach for a raw `redis.del` — invalidation
always goes through `container.invalidation`, e.g.
`evictGuildRedisState()` (`packages/core/src/lib/database/guild-eviction.ts`)
sweeping every key pattern a departed guild's config/module cache can occupy.

## Consequences

Cache correctness doesn't depend on the dashboard's SSE plumbing or on a
stream a process might not be consuming; it's a small, dedicated,
synchronous-per-call mechanism whose only job is "every process's cache
agrees." The trade-off is that this is pub/sub, not a durable log — a process
that's disconnected when an invalidation fires misses it, which is why
`onResync()` exists as a defensive full-resync path rather than relying on
delivery alone. This is a narrower, stricter version of "event-driven" than
ADR 0005's stream, and the two are deliberately not merged.
