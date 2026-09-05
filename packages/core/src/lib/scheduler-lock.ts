import type { RedisClient } from "#lib/database/cluster-safe.js";
import { RedisKeys } from "#lib/database/redis.js";
import { getConsumerId } from "#lib/env.js";
import { acquireRedisLock, type RedisLock } from "#lib/redis-lock.js";

/**
 * Exclusive fleet-wide lease on the scheduler role.
 *
 * `isPrimaryShard()` is a purely local calculation, so two processes can both
 * believe they hold shard 0 - a hung predecessor ShardingManager has already
 * replaced, for instance - and every scheduled task then fires twice. The
 * lease makes the role single-holder: a second claimant fails fast instead of
 * starting, and `onLost` fires if the lease is taken over while still held.
 */
const LeaseMs = 30_000;

export function acquireSchedulerLock(
  redis: RedisClient,
  onLost: () => void,
): Promise<RedisLock> {
  return acquireRedisLock(redis, RedisKeys.schedulerLeader(), {
    ttlMs: LeaseMs,
    acquireTimeoutMs: 0,
    onLostLock: onLost,
  }).catch((cause: unknown) => {
    throw new Error(
      `[Primary] Failed to acquire scheduler lock (this process=${getConsumerId()})`,
      { cause },
    );
  });
}
