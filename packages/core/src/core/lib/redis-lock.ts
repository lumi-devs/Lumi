import { randomUUID } from "node:crypto";
import type { Redis } from "ioredis";

/**
 * Lightweight Redis-backed mutex. Mutual exclusion across processes; a
 * single Redis is sufficient for our scale (single Redis primary today,
 * not multi-master). Auto-extends while held so long transactions don't
 * lose the lock to TTL; only the original owner can release.
 *
 * Not FIFO — waiters retry with capped exponential backoff. Use this when
 * mutual exclusion across workers matters, not ordering.
 */

// Release-if-owner. Returns 1 if released, 0 if the lock had drifted to
// another owner (no-op release). Guards against stale releases after a
// fenced extend failure.
const RELEASE_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
else
  return 0
end
`;

// Extend-if-owner. Same fencing — only the original owner can refresh.
const EXTEND_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('PEXPIRE', KEYS[1], ARGV[2])
else
  return 0
end
`;

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

export async function acquireRedisLock(
  redis: Redis,
  key: string,
  options: RedisLockOptions = {},
): Promise<() => Promise<void>> {
  const opts = { ...DEFAULTS, ...options };
  const token = randomUUID();
  const deadline = Date.now() + opts.acquireTimeoutMs;
  let delay = opts.retryDelayMs;

  // 1. Acquire with bounded retry.
  while (true) {
    const ok = await redis.set(key, token, "PX", opts.ttlMs, "NX");
    if (ok === "OK") break;
    if (Date.now() >= deadline) {
      throw new Error(`Timeout acquiring Redis lock: ${key}`);
    }
    await sleep(delay);
    delay = Math.min(delay * 2, opts.maxRetryDelayMs);
  }

  // 2. Auto-renew at ~half the lease so a slow transaction doesn't expire mid-flight.
  let released = false;
  const renew = setInterval(
    () => {
      if (released) return;
      redis
        .eval(EXTEND_SCRIPT, 1, key, token, opts.ttlMs.toString())
        .catch(() => null);
    },
    Math.floor(opts.ttlMs / 2),
  );
  // Don't keep the event loop alive purely for renewal.
  renew.unref?.();

  return async () => {
    if (released) return;
    released = true;
    clearInterval(renew);
    await redis.eval(RELEASE_SCRIPT, 1, key, token).catch(() => null);
  };
}
