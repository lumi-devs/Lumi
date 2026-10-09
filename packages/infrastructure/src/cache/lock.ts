import { randomUUID } from "node:crypto";
import type { ValkeyClient } from "../database/cluster-safe.js";
import type { CacheLogger } from "./types.js";

export const ValkeyReleaseScript = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
else
  return 0
end
`;

export const ValkeyExtendScript = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('PEXPIRE', KEYS[1], ARGV[2])
else
  return 0
end
`;

export const ValkeyVerifyScript = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return 1
else
  return 0
end
`;

/** Checks a lock is still held by `token` - detects a stale holder before a guarded write. */
export async function verifyValkeyLock(
  valkey: ValkeyClient,
  key: string,
  token: string,
): Promise<boolean> {
  const held = await valkey.eval(ValkeyVerifyScript, 1, key, token);
  return held === 1;
}

export interface ValkeyLockOptions {
  /** Lock lease in ms. Auto-renewed at lease/2 while held. */
  ttlMs?: number;
  /** Max wait before giving up. */
  acquireTimeoutMs?: number;
  /** Initial backoff between acquire attempts. */
  retryDelayMs?: number;
  /** Cap on backoff. */
  maxRetryDelayMs?: number;
  /** Called when a renewal finds the lease is no longer ours. */
  onLostLock?: () => void;
  /** Optional logger for renewal failures. */
  logger?: CacheLogger;
}

const Defaults: Required<Omit<ValkeyLockOptions, "logger">> = {
  ttlMs: 15_000,
  acquireTimeoutMs: 30_000,
  retryDelayMs: 25,
  maxRetryDelayMs: 250,
  onLostLock: () => undefined,
};

export interface ValkeyLock {
  /** Releases the lock. Safe to call more than once. */
  release: () => Promise<void>;
  /** Fencing token identifying this acquisition. */
  token: string;
}

export async function acquireValkeyLock(
  valkey: ValkeyClient,
  key: string,
  options: ValkeyLockOptions = {},
): Promise<ValkeyLock> {
  const opts = { ...Defaults, ...options };
  const log = options.logger ?? console;
  const token = randomUUID();
  const deadline = Date.now() + opts.acquireTimeoutMs;
  let delay = opts.retryDelayMs;

  while (true) {
    const ok = await valkey.set(key, token, "PX", opts.ttlMs, "NX");
    if (ok === "OK") break;
    if (Date.now() >= deadline) {
      throw new Error(`Timeout acquiring Valkey lock: ${key}`);
    }
    await Bun.sleep(delay);
    delay = Math.min(delay * 2, opts.maxRetryDelayMs);
  }

  let released = false;
  let consecutiveRenewFailures = 0;
  const renew = setInterval(
    () => {
      if (released) return;
      valkey
        .eval(ValkeyExtendScript, 1, key, token, opts.ttlMs.toString())
        .then((res: unknown) => {
          if (released) return;
          if (res === 1) {
            consecutiveRenewFailures = 0;
          } else {
            consecutiveRenewFailures++;
            const message = `[valkey-lock] Failed to renew lock "${key}" (${consecutiveRenewFailures} consecutive failure${consecutiveRenewFailures === 1 ? "" : "s"})`;
            log.error?.(message);
            if (consecutiveRenewFailures === 1) {
              opts.onLostLock();
            }
          }
        })
        .catch((err: unknown) => {
          if (released) return;
          consecutiveRenewFailures++;
          const message = `[valkey-lock] Failed to renew lock "${key}" (${consecutiveRenewFailures} consecutive failure${consecutiveRenewFailures === 1 ? "" : "s"})`;
          log.error?.(message, err);
          if (consecutiveRenewFailures === 1) {
            opts.onLostLock();
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
    await valkey.eval(ValkeyReleaseScript, 1, key, token).catch(() => null);
  };

  return { release, token };
}
