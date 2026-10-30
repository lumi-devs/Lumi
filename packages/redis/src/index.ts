import type { RedisOptions } from "ioredis";
import Redis from "ioredis";

export { Redis } from "ioredis";

export { InvalidationBus, type InvalidationMessage } from "./invalidation.js";
export { createKeys, type RedisKeys, TTL } from "./keys.js";
export {
  createLock,
  DistributedLock,
  type LockOptions,
  withLock,
} from "./locks.js";

export function createRedisClient(options?: RedisOptions): Redis {
  return new Redis({
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => Math.min(times * 100, 3000),
    enableReadyCheck: true,
    lazyConnect: true,
    ...options,
  });
}
