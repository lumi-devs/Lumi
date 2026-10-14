import { RateLimitManager } from "@sapphire/ratelimits";

const defaultCooldownManager = new RateLimitManager(5_000, 1);
const managers = new Map<number, RateLimitManager>();

function getManager(durationMs: number): RateLimitManager {
  let m = managers.get(durationMs);
  if (!m) {
    m = new RateLimitManager(durationMs, 1);
    managers.set(durationMs, m);
  }
  return m;
}

export function claimCooldown(key: string, durationMs: number): boolean {
  if (durationMs <= 0) return true;
  const manager = getManager(durationMs);
  const bucket = manager.acquire(key);
  if (bucket.limited) {
    return false;
  }
  bucket.consume();
  return true;
}

export function isOnCooldown(key: string, durationMs = 5_000): boolean {
  const manager = getManager(durationMs);
  const bucket = manager.acquire(key);
  return bucket.limited;
}

export function clearCooldown(key: string): void {
  for (const m of managers.values()) {
    m.delete(key);
  }
  defaultCooldownManager.delete(key);
}
