import "server-only";
import { RateLimiterMemory } from "rate-limiter-flexible";

// Per-process rate limiter — dashboard.md §5F. Backed by
// `rate-limiter-flexible`'s in-memory driver for correct sliding-window
// semantics (vs. the fixed-window bucket this used to hand-roll). Still
// process-local: it does not coordinate across multiple dashboard replicas.
// Swapping the driver for `RateLimiterRedis` (same library) would give
// cross-replica coordination; out of scope for this rewrite.
//
// `limit`/`windowMs` vary per call site, so limiters are cached per
// (limit, windowMs) pair rather than constructed once — each pair gets its
// own independent point budget, matching the old per-bucket-config behavior.
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

/** Returns true when `key` has exceeded `limit` calls within `windowMs`. */
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
