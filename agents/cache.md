# Cache

Package: `@lumi/cache` (`packages/cache/src/cache.ts`).

## Model

Two tiers:

- **L1**: per-process bounded LRU `Map`, default 10k entries, local TTL capped at
  5 seconds. The cap bounds staleness if pub/sub is down.
- **L2**: Redis strings, TTL with ±10% jitter to stop synchronized expiry waves.

`null` is cached in the **same key** as a positive value with a short negative
TTL. There is no separate `neg:` key, so a positive write always replaces a
negative marker.

Loads are coalesced per process. If a key is invalidated while a load is in
flight, the flight is marked discarded; the late result is still returned to the
original caller but is never written to L1 or Redis.

## Usage

```ts
const cache = new Cache({ redis, invalidation, metrics: prometheusCacheMetrics });
const config = cache.namespace("config");

const value = await config.getOrLoad(key, ttlMs, () => loader(), {
  negativeTtlMs: 15_000,
});
```

Rules:

- Always call `namespace(name)`. The name is the metrics label; never derive it
  from a key.
- `getOrLoad` returns `T | null`. Do not cast `null` to `T`.
- Use `getMany` for a fixed set of independent keys to turn N reads into one
  `MGET`.
- `delete(...keys)` goes through the invalidation bus: local drop -> Redis DEL ->
  publish. Call it **after** the database transaction commits.
- Do not cache whole ORM rows unless the value round-trips through `devalue`
  (Date, BigInt, Map, Set are supported).
- Do not add a cache for a key nobody invalidates.

## Codec

`devalue` (`packages/cache/src/codec.ts`). It preserves `Date`, `BigInt`, `Map`,
`Set`, `undefined`, `NaN`, `-0`. If a value cannot be encoded, the load fails
loudly; fix the value shape rather than falling back to `JSON.stringify`.

## Invalidation contract

`InvalidationBus` (`packages/redis/src/invalidation.ts`) notifies local listeners
first, then `DEL`s Redis, then publishes. Subscribers drop matching L1 entries and
discard flights. On reconnect, `onResync` clears all local entries.

## Metrics

`lumi_cache_hits_total`, `cache_misses_total`, `cache_negative_hits_total`,
`cache_writes_total`, `cache_evictions_total`, `cache_invalidations_total`,
`cache_fill_duration_seconds`, `cache_stale_writes_total`, all labelled
`cache="<namespace>"`.
