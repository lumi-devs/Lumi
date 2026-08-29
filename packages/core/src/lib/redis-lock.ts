import { randomUUID } from "node:crypto";
import { container } from "@sapphire/framework";
import type { RedisClient } from "#lib/database/cluster-safe.js";

/**
 * Lightweight Redis-backed mutex. Mutual exclusion across processes; a
 * single Redis is sufficient for our scale (single Redis primary today,
 * not multi-master). Auto-extends while held so long transactions don't
 * lose the lock to TTL; only the original owner can release.
 *
 * Not FIFO - waiters retry with capped exponential backoff. Use this when
 * mutual exclusion across workers matters, not ordering.
 */

export const REDIS_RELEASE_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
else
  return 0
end
`;

export const REDIS_EXTEND_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('PEXPIRE', KEYS[1], ARGV[2])
else
  return 0
end
`;

export const REDIS_VERIFY_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return 1
else
  return 0
end
`;

/** Checks a lock is still held by `token` - detects a stale holder (lease expired, reacquired elsewhere) before a guarded write. */
export async function verifyRedisLock(
  redis: RedisClient,
  key: string,
  token: string,
): Promise<boolean> {
  const held = await redis.eval(REDIS_VERIFY_SCRIPT, 1, key, token);
  return held === 1;
}

export interface RedisLockOptions {
  /** Lock lease in ms. Auto-renewed at lease/2 while held. */
  ttlMs?: number;
  /** Max wait before giving up. */
  acquireTimeoutMs?: number;
  /** Initial backoff between acquire attempts. */
  retryDelayMs?: number;
  /** Cap on backoff. */
  maxRetryDelayMs?: number;
}

const DEFAULTS: Required<RedisLockOptions> = {
  ttlMs: 15_000,
  acquireTimeoutMs: 30_000,
  retryDelayMs: 25,
  maxRetryDelayMs: 250,
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface RedisLock {
  /** Releases the lock. Safe to call more than once. */
  release: () => Promise<void>;
  /** Fencing token identifying this acquisition - use with `verifyRedisLock` to detect a stale holder. */
  token: string;
}

export async function acquireRedisLock(
  redis: RedisClient,
  key: string,
  options: RedisLockOptions = {},
): Promise<RedisLock> {
  const opts = { ...DEFAULTS, ...options };
  const token = randomUUID();
  const deadline = Date.now() + opts.acquireTimeoutMs;
  let delay = opts.retryDelayMs;

  while (true) {
    const ok = await redis.set(key, token, "PX", opts.ttlMs, "NX");
    if (ok === "OK") break;
    if (Date.now() >= deadline) {
      throw new Error(`Timeout acquiring Redis lock: ${key}`);
    }
    await sleep(delay);
    delay = Math.min(delay * 2, opts.maxRetryDelayMs);
  }

  let released = false;
  let consecutiveRenewFailures = 0;
  const renew = setInterval(
    () => {
      if (released) return;
      redis
        .eval(REDIS_EXTEND_SCRIPT, 1, key, token, opts.ttlMs.toString())
        .then(() => {
          consecutiveRenewFailures = 0;
        })
        .catch((err) => {
          consecutiveRenewFailures++;
          const message = `[redis-lock] Failed to renew lock "${key}" (${consecutiveRenewFailures} consecutive failure${consecutiveRenewFailures === 1 ? "" : "s"})`;
          if (container.logger) {
            container.logger.error(message, err);
          } else {
            console.error(message, err);
          }
        });
    },
    Math.floor(opts.ttlMs / 2),
  );
  renew.unref?.();

  const release = async () => {
    if (released) return;
    released = true;
    clearInterval(renew);
    await redis.eval(REDIS_RELEASE_SCRIPT, 1, key, token).catch(() => null);
  };

  return { release, token };
}
