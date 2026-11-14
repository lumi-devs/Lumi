import type {RedisClient} from "@redis/Cluster.js";
import type {CacheLogger} from "@redis/Store.js";
import { RedisKeys } from "@redis/Store.js";
import { getConsumerId } from "@lib/Env.js";
import {acquireRedisLock} from "@redis/Lock.js";
import { type RedisLock } from "@redis/Lock.js";

const LeaseMs = 30_000;

export interface SchedulerLockOptions {
  ttlMs?: number;
  acquireTimeoutMs?: number;
}

export function acquireSchedulerLock(
  redis: RedisClient,
  onLost: () => void,
  logger?: CacheLogger,
  options: SchedulerLockOptions = {},
): Promise<RedisLock> {
  const ttlMs = options.ttlMs ?? LeaseMs;
  return acquireRedisLock(redis, RedisKeys.schedulerLeader(), {
    ttlMs,
    acquireTimeoutMs: options.acquireTimeoutMs ?? ttlMs + 15_000,
    onLostLock: onLost,
    ...(logger ? { logger } : {}),
  }).catch((cause: unknown) => {
    throw new Error(
      `[Primary] Failed to acquire scheduler lock (this process=${getConsumerId()})`,
      { cause },
    );
  });
}
