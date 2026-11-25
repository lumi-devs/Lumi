# Redis

Package: `@lumi/redis` (`packages/redis`). `ioredis`, single endpoint.

## Why no cluster/sentinel

Lumi's bottleneck is Discord, not Redis key-slot throughput. Cluster and Sentinel
support added key-slot branching to every multi-key operation and still required
pub/sub fan-out. v2 runs one Redis endpoint (managed HA is fine). Do not add
cluster/sentinel branches without a measured requirement.

## Clients

- `createRedisClient(options?)` — lazy connect, ready check, bounded retry
  backoff, `maxRetriesPerRequest: 3`.
- Cache/publisher: one client.
- Subscriber: a dedicated client owned by `InvalidationBus` (`redis.duplicate()`).

## Keys

All keys come from `createKeys(namespace)` (`packages/redis/src/keys.ts`).

```ts
const keys = createKeys("lumi");
keys.guildConfig(guildId, module);
```

Never hand-build a key in a module. Add a builder and a TTL to `keys.ts` when you
need a new shape.

Panel sessions (`panelSession(messageId)`, one hour) store `<ownerId>:<guildId>`
for `/lumi` interactions. They are refreshed on every click and are intentionally
plain keys, not cached values: the global dispatcher may run on any replica.

## Invalidation

`InvalidationBus` owns channel `lumi:invalidation`. `invalidate(namespace, keys)`:

1. notifies local listeners synchronously,
2. publishes `{ namespace, keys, timestamp }`.

The bus does not delete Redis keys. `Cache.delete(...keys)` performs the `DEL`
and then calls `invalidate`, so the write path owns both removal and fan-out.

Subscribers drop their L1 entries. On reconnect the bus signals `onResync`; the
cache clears its local state. Writes must call this after commit.

## Locks and cooldowns

- `withLock(redis, key, fn, options?)` — acquires a SET NX PX lock, runs `fn`,
  and releases with a compare-and-delete Lua script.
- `createLock(redis, key, options?)` / `DistributedLock` — manual acquire/release
  with the same semantics.

Do not use a local `Map` for cross-process coordination.
