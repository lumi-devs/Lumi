import type { ModuleServices } from "./types.js";

export type LockRelease = () => Promise<void>;

const LocalLocks = new Map<string, Promise<void>>();

async function acquireLocal(key: string): Promise<LockRelease> {
  const previous = LocalLocks.get(key) ?? Promise.resolve();
  const { promise: current, resolve: release } = Promise.withResolvers<void>();
  const tail = previous.then(() => current);
  LocalLocks.set(key, tail);
  await previous;
  return async () => {
    release();
    if (LocalLocks.get(key) === tail) LocalLocks.delete(key);
  };
}

export interface KeyLockOptions {
  deadlineMs?: number;
  lockTtlMs?: number;
  pollMs?: number;
}

export async function withKeyLock<T>(
  services: ModuleServices,
  key: string,
  task: () => Promise<T>,
  options: KeyLockOptions = {},
): Promise<T> {
  const { deadlineMs = 5_000, lockTtlMs = 30_000, pollMs = 20 } = options;
  const releaseLocal = await acquireLocal(key);
  try {
    if (!services.helpers.cache.distributed) return await task();

    const deadline = Date.now() + deadlineMs;
    let release: LockRelease | null = null;
    while (!release && Date.now() < deadline) {
      release = await services.helpers.cache
        .takeLock(key, lockTtlMs)
        .catch(() => null);
      if (!release) {
        const { promise, resolve } = Promise.withResolvers<void>();
        setTimeout(resolve, pollMs);
        await promise;
      }
    }
    try {
      return await task();
    } finally {
      if (release) await release().catch(() => undefined);
    }
  } finally {
    await releaseLocal();
  }
}

export async function tryKeyLock(
  services: ModuleServices,
  key: string,
  ttlMs: number,
): Promise<LockRelease | null> {
  if (services.helpers.cache.distributed) {
    return services.helpers.cache.takeLock(key, ttlMs).catch(() => null);
  }
  return acquireLocal(key);
}
