import "server-only";
import { RateLimiterMemory, RateLimiterRedis } from "rate-limiter-flexible";
import Redis from "ioredis";

/**
 * Rate limiting utility using Redis for multi-instance coordination when available.
 * Falls back to in-memory rate limiting for local development or if Redis is not configured.
 * Multi-instance coordination ensures rate limits are respected across all dashboard replicas.
 */

let redisClient: Redis | null = null;

if (process.env.REDIS_URL) {
  redisClient = new Redis(process.env.REDIS_URL, {
    enableOfflineQueue: false,
    lazyConnect: true,
  });
  // Prevent unhandled error event crash/logs if Redis is unreachable
  redisClient.on("error", () => {});
} else {
  console.warn("WARNING: No REDIS_URL configured. Falling back to in-memory rate limiting. Multi-instance coordination will not work.");
}

type RateLimiter = RateLimiterMemory | RateLimiterRedis;

const limiters = new Map<string, RateLimiter>();

function getLimiter(limit: number, windowMs: number): RateLimiter {
  const cacheKey = `${limit}:${windowMs}`;
  let limiter = limiters.get(cacheKey);
  
  if (!limiter) {
    if (redisClient) {
      limiter = new RateLimiterRedis({
        storeClient: redisClient,
        keyPrefix: `rl:${limit}:${windowMs}`,
        points: limit,
        duration: windowMs / 1000,
        // The insurance limiter provides a secondary defense layer if Redis fails
        insuranceLimiter: new RateLimiterMemory({
          points: limit,
          duration: windowMs / 1000,
        }),
      });
    } else {
      limiter = new RateLimiterMemory({
        points: limit,
        duration: windowMs / 1000,
      });
    }
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
