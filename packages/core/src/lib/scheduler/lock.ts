import type { ValkeyClient } from "@lumi/infrastructure/database";
import type { CacheLogger } from "@lumi/infrastructure/cache";
import { ValkeyKeys } from "@lumi/lib/valkey/client.js";
import { getConsumerId } from "@lumi/lib/env.js";
import { acquireValkeyLock, type ValkeyLock } from "@lumi/infrastructure/cache";

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
  valkey: ValkeyClient,
  onLost: () => void,
  logger?: CacheLogger,
): Promise<ValkeyLock> {
  return acquireValkeyLock(valkey, ValkeyKeys.schedulerLeader(), {
    ttlMs: LeaseMs,
    acquireTimeoutMs: 0,
    onLostLock: onLost,
    ...(logger ? { logger } : {}),
  }).catch((cause: unknown) => {
    throw new Error(
      `[Primary] Failed to acquire scheduler lock (this process=${getConsumerId()})`,
      { cause },
    );
  });
}
