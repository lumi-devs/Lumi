import "server-only";
import { RateLimiterMemory } from "rate-limiter-flexible";

// Process-local: this does not coordinate across dashboard replicas. Swapping
// the driver for `RateLimiterRedis` (same library) is what would.
//
// Keyed per (limit, windowMs) so each call site gets its own point budget
// rather than sharing one.
const limiters = new Map<string, RateLimiterMemory>();

function getLimiter(limit: number, windowMs: number): RateLimiterMemory {
  const cacheKey = `${limit}:${windowMs}`;
  let limiter = limiters.get(cacheKey);
  if (!limiter) {
    limiter = new RateLimiterMemory({
      points: limit,
      duration: windowMs / 1000,
    });
    limiters.set(cacheKey, limiter);
  }
  return limiter;
}

export async function isRateLimited(
  key: string,
  limit = 30,
  windowMs = 60_000,
): Promise<boolean> {
  try {
    await getLimiter(limit, windowMs).consume(key);
    return false;
  } catch {
    // rate-limiter-flexible rejects the promise (rather than throwing) when
    // the key is out of points — that rejection *is* the "limited" signal.
    return true;
  }
}
