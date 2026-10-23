# Redis

Package: `@lumi/redis` (`packages/redis`). `ioredis`, single endpoint.

## Why no cluster/sentinel

Lumi's bottleneck is Discord, not Redis key-slot throughput. Cluster and Sentinel
support added key-slot branching to every multi-key operation and still required
pub/sub fan-out. v2 runs one Redis endpoint (managed HA is fine). Do not add
cluster/sentinel branches without a measured requirement.

## Clients

- `createRedisClient({ url, role, logger })` — lazy connect, 5s command timeout,
  no offline queue, bounded retry backoff, command-duration metrics.
- Cache/publisher: one client.
- Subscriber: a dedicated client owned by `InvalidationBus`.

## Keys

All keys come from `createKeys(namespace)` (`packages/redis/src/keys.ts`).

```ts
const keys = createKeys("lumi");
keys.guildConfig(guildId, module);
```

Never hand-build a key in a module. Add a builder and a TTL to `keys.ts` when you
need a new shape.

## Invalidation

`InvalidationBus` owns channel `lumi:cache:invalidate`. `invalidate(...keys)`:

1. notifies local listeners synchronously,
2. `DEL`s the keys (500 per chunk),
3. publishes `{ keys, time }`.

Subscribers drop their L1 entries. On reconnect the bus signals `onResync`; the
cache clears its local state. Writes must call this after commit.

## Locks and cooldowns

- `withLock(redis, key, ttlMs, work)` — SET NX PX + compare-and-delete Lua.
- `claim(redis, key, ttlMs)` — one-shot cooldown claim, returns `false` if held.

Do not use a local `Map` for cross-process coordination.
