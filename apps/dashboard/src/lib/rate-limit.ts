import "server-only";
import { RateLimiterMemory } from "rate-limiter-flexible";

/**
 * In-memory rate limiting utility. Per Ground Rule 8, apps/dashboard must never
 * connect to Redis directly, so rate limits are not coordinated across replicas.
 */

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
    const limiter = getLimiter(limit, windowMs);
    await limiter.consume(key);
    return false;
  } catch (error) {
    // rate-limiter-flexible rejects the promise (rather than throwing) when
    // the key is out of points — that rejection *is* the "limited" signal.
    // If Redis is disconnected and an insuranceLimiter is provided, the library
    // automatically delegates to the insuranceLimiter.
    return true;
  }
}
