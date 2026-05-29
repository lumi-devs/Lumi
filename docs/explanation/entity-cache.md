# Redis entity cache (S8 slice 3)

> The reason workers can become *truly* stateless at scale.

## Problem

discord.js maintains a per-`Client` cache of guilds, channels, roles, members,
etc. With our existing cache-cap settings the dominant line item is still
`GuildManager` (~25 KB/guild after we zero presence/messages/voice). At 100k
guilds, that's ~2.5 GB before you write any of your own code. With horizontal
worker scale we want N workers, each cheap enough to KEDA up/down on demand.

## Approach

`container.entityCache` is a thin Redis-backed projection of the entities a
module actually reads:

```ts
container.entityCache.guild(guildId)    // CachedGuild | null
container.entityCache.channel(channelId)// CachedChannel | null
container.entityCache.role(roleId)      // CachedRole | null
container.entityCache.member(g, u)      // CachedMember | null
container.entityCache.user(userId)      // CachedUser | null
```

Each projection is intentionally narrow — id, name, owner/parent, permission
bits, position, type. Anything else, the module reads from REST or stays on
the discord.js cache. The shape is *different* from discord.js's so call sites
that need migrating fail at the type level.

## Population

Worker-side, the `installEntityPopulator()` listener subscribes to the raw
dispatch stream that already drives discord.js. On every relevant event it
upserts the Redis hash; on DELETE it `DEL`s the key. TTL on every key is 24h
(`RedisTTL.entity`) so a missed DELETE doesn't leave an orphan forever.

The populator is **cooperative**: any worker consuming the event writes for
the whole fleet. Last-write-wins is correct because the projection is purely
derived data.

Gateway never writes — the publish hot loop must not block on Redis.

## Migration

For each call site that today reads `client.guilds.cache.get(id)` etc.:

1. Identify the field set the call site needs.
2. If the field is in `CachedGuild`/`CachedChannel`/`CachedRole`/etc., swap to
   `await container.entityCache.<entity>(id)`.
3. If the call needs something outside the projection (e.g. presence,
   members list with avatars), keep the existing discord.js call — but treat
   it as a memory cost that scales with guild count.

`grep -r "client.guilds.cache\|client.channels.cache\|client.users.cache"`
gives you the migration surface. Migration is mechanical and per-module; not
done in one pass.

## What this is NOT

- Not a CDN. Read latency is one Redis RTT (~1–2 ms on the same network).
- Not transactional. Two near-simultaneous CHANNEL_UPDATE writes from
  different workers can interleave; the projection ends up with one of the
  two writes, not a merge. Fine for derived state.
- Not authoritative. Discord's REST is. If you need accuracy-now, fetch.
