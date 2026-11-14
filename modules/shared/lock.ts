import { errorMessage } from "@lumi/foundation";
import type { ModuleServices } from "@lumi/module-kit";

const localLocks = new Set<string>();
const RetryDelayMs = 25;

export type LockResult<T> =
  { ok: true; value: T } | { ok: false; reason: "busy" | "unavailable" };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function tryWithLock<T>(
  services: ModuleServices,
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
  waitMs = 0,
): Promise<LockResult<T>> {
  const deadline = Date.now() + Math.max(0, waitMs);

  for (;;) {
    while (localLocks.has(key)) {
      if (Date.now() >= deadline) return { ok: false, reason: "busy" };
      await sleep(RetryDelayMs);
    }

    localLocks.add(key);
    let acquiredLocal = true;
    let release: (() => Promise<void>) | null = null;
    try {
      if (services.helpers.cache.distributed) {
        try {
          release = await services.helpers.cache.takeLock(key, ttlMs);
        } catch (error) {
          services.observability?.logger?.warn?.("operation lock unavailable", {
            key,
            error: errorMessage(error),
          });
          return { ok: false, reason: "unavailable" };
        }
        if (!release) {
          localLocks.delete(key);
          acquiredLocal = false;
          if (Date.now() >= deadline) return { ok: false, reason: "busy" };
          await sleep(RetryDelayMs);
          continue;
        }
      }
      return { ok: true, value: await fn() };
    } finally {
      if (acquiredLocal) localLocks.delete(key);
      if (release) await release().catch(() => undefined);
    }
  }
}
