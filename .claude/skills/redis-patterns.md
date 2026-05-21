# Redis Patterns

All ephemeral/temporary data lives in Redis. All persistent data lives in Postgres.
Redis is also the backbone for cross-shard RPC.

---

## Key Namespace Reference

All keys follow: `ember:{namespace}:{...discriminants}`

Defined centrally in `src/redis/keys.ts` — never hard-code a key string outside that file.

| Key pattern | TTL | Type | Used for |
|---|---|---|---|
| `ember:cfg:{module}:guild:{guildId}` | 60s | String (JSON) | Guild config cache (read-through from Postgres) |
| `ember:cfg:global` | 120s | String (JSON) | Global config cache |
| `ember:module:enabled:{module}:{guildId}` | none | String "1" | Module enabled state (absent = default enabled) |
| `ember:perms:{cmdPath}:{guildId}` | 120s | String (JSON) | Permission override cache |
| `ember:cd:{cmd}:user:{userId}` | {cooldown}s | String "1" | Command cooldowns |
| `ember:spam:{guildId}:{userId}` | window+5s | Sorted Set | Sliding-window spam counter |
| `ember:afk:{guildId}:{userId}` | none | String (JSON) | AFK status |
| `ember:tempvc:{channelId}` | none | String (JSON) | Active temp voice channel |
| `ember:block:guild/{guildId}:{userId}` | 300s | String "1" | User blocklist cache |
| `ember:ignore:guild:{guildId}` | 300s | String "1" | Ignored guild cache |
| `ember:rpc:in` | — | PubSub channel | RPC requests from dashboard |
| `ember:rpc:out:{requestId}` | 30s | String (JSON) | RPC responses |
| `ember:stats:bot` | 15s | String (JSON) | Bot stats for dashboard |

---

## Cache-Aside Pattern (guild config)

```typescript
async function getGuildConfig(module: string, guildId: string) {
  const key = RedisKeys.guildConfig(module, guildId);
  const cached = await container.redis.get(key);
  if (cached) return JSON.parse(cached);

  const row = await container.db.query.birthdayGuildConfig.findFirst({
    where: (t, { eq }) => eq(t.guildId, BigInt(guildId)),
  });

  if (row) {
    await container.redis.setex(key, RedisTTL.guildConfig, JSON.stringify(row));
  }
  return row ?? null;
}

// Invalidate on write:
async function setGuildConfig(module: string, guildId: string, data: Partial<Config>) {
  await container.db.update(birthdayGuildConfig)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(birthdayGuildConfig.guildId, BigInt(guildId)));
  await container.redis.del(RedisKeys.guildConfig(module, guildId));
}
```

---

## Sliding-Window Rate Limiter (spam detection)

```typescript
// Returns true if the user is over the limit
async function isSpammy(
  redis: Redis,
  guildId: string,
  userId: string,
  windowSeconds: number,
  maxCount: number,
): Promise<boolean> {
  const key = RedisKeys.spamWindow(guildId, userId);
  const now = Date.now();
  const windowMs = windowSeconds * 1000;

  const pipeline = redis.pipeline();
  pipeline.zadd(key, now, `${now}-${Math.random().toString(36).slice(2)}`);
  pipeline.zremrangebyscore(key, '-inf', now - windowMs);
  pipeline.zcard(key);
  pipeline.expire(key, windowSeconds + RedisTTL.spamWindowBuffer);
  const results = await pipeline.exec();

  const count = (results![2][1] as number) ?? 0;
  return count > maxCount;
}
```

---

## Command Cooldowns (SET NX — atomic, no race conditions)

```typescript
async function checkCooldown(
  redis: Redis,
  commandName: string,
  userId: string,
  cooldownSeconds: number,
): Promise<number | null> {
  // Returns null = not on cooldown, number = seconds remaining
  const key = RedisKeys.cooldown(commandName, userId);
  const result = await redis.set(key, '1', 'EX', cooldownSeconds, 'NX');
  if (result === 'OK') return null; // set successfully, not on cooldown
  const ttl = await redis.ttl(key);
  return ttl > 0 ? ttl : null;
}
```

---

## RPC Pub/Sub

See `rpc-bridge.md` for full documentation.

```typescript
// Subscribe (bot side — one dedicated Redis connection)
sub.subscribe('ember:rpc:in');
sub.on('message', async (_, msg) => {
  const req = JSON.parse(msg);
  const result = await handleRpcRequest(req);
  await redis.setex(`ember:rpc:out:${req.id}`, 30, JSON.stringify(result));
});

// Publish (dashboard side)
await redis.publish('ember:rpc:in', JSON.stringify({ id, action, guildId, data }));
const response = await waitForKey(`ember:rpc:out:${id}`); // poll or subscribe
```

---

## Rules

- **One dedicated Redis connection for subscriptions** — a subscribed client cannot send commands. Use `redis.duplicate()` for the subscriber.
- **All key strings defined in `src/redis/keys.ts`** — never hard-code `ember:...` anywhere else.
- **TTLs defined in `RedisTTL` constants** — never magic numbers.
- **Never store sensitive data in Redis without TTL** — Redis is not a durable store.
- **Sorted sets for sliding windows** — not counters (counters can't expire individual entries).
- **`SET NX PX` for cooldowns** — atomic, no separate GET+SET race condition.
