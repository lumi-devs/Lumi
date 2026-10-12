import type {ValkeyClient} from "#src/lib/valkey/Cluster.js";
import type {CacheLogger} from "#src/lib/valkey/Store.js";
import { ValkeyKeys } from "#src/lib/valkey/Store.js";
import { getConsumerId } from "#src/lib/Env.js";
import {acquireValkeyLock} from "#src/lib/valkey/Lock.js";
import { type ValkeyLock } from "#src/lib/valkey/Lock.js";

const LeaseMs = 30_000;

export function acquireSchedulerLock(
  valkey: ValkeyClient,
  onLost: () => void,
  logger?: CacheLogger,
): Promise<ValkeyLock> {
  return acquireValkeyLock(valkey, ValkeyKeys.schedulerLeader(), {
    ttlMs: LeaseMs,
    acquireTimeoutMs: LeaseMs + 15_000,
    onLostLock: onLost,
    ...(logger ? { logger } : {}),
  }).catch((cause: unknown) => {
    throw new Error(
      `[Primary] Failed to acquire scheduler lock (this process=${getConsumerId()})`,
      { cause },
    );
  });
}
