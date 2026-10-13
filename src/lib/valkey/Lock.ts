import { randomUUID } from "node:crypto";
import type { ValkeyClient } from "#src/lib/valkey/Cluster.js";
import type { CacheLogger } from "#src/lib/valkey/Store.js";

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

export async function verifyValkeyLock(
  valkey: ValkeyClient,
  key: string,
  token: string,
): Promise<boolean> {
  const held = await valkey.eval(ValkeyVerifyScript, 1, key, token);
  return held === 1;
}

export interface ValkeyLockOptions {

  ttlMs?: number;

  acquireTimeoutMs?: number;

  retryDelayMs?: number;

  maxRetryDelayMs?: number;

  onLostLock?: () => void;

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

  release: () => Promise<void>;

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
  const noteRenewFailure = (err?: unknown): void => {
    consecutiveRenewFailures++;
    const plural = consecutiveRenewFailures === 1 ? "" : "s";
    const message = `[valkey-lock] Failed to renew lock "${key}" (${consecutiveRenewFailures} consecutive failure${plural})`;
    if (err === undefined) log.error?.(message);
    else log.error?.(message, err);
    if (consecutiveRenewFailures === 2) {
      opts.onLostLock();
    }
  };
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
            noteRenewFailure();
          }
        })
        .catch((err: unknown) => {
          if (released) return;
          noteRenewFailure(err);
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
