import Redis from "ioredis";
import type { RedisOptions } from "ioredis";

export { Redis } from "ioredis";

export { InvalidationBus, type InvalidationMessage } from "./invalidation.js";
export { DistributedLock, createLock, withLock, type LockOptions } from "./locks.js";
export { createKeys, TTL, type RedisKeys } from "./keys.js";

export function createRedisClient(options?: RedisOptions): Redis {
  return new Redis({
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => Math.min(times * 100, 3000),
    enableReadyCheck: true,
    lazyConnect: true,
    ...options,
  });
}
