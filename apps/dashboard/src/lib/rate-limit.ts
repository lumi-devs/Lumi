import "server-only";

// Per-process sliding-window rate limiter — dashboard.md §5F. Ported
// straight from the old server.ts implementation: a Map keyed by identity
// (IP or session user id), same semantics. Note this is process-local, same
// caveat the old implementation had: it does not coordinate across multiple
// dashboard replicas. A shared Redis-backed limiter would be needed for
// horizontal scaling; out of scope for this rewrite.
const buckets = new Map<string, { count: number; resetAt: number }>();

/** Returns true when `key` has exceeded `limit` calls within `windowMs`. */
export function isRateLimited(
  key: string,
  limit = 30,
  windowMs = 60_000,
): boolean {
  const now = Date.now();
  const entry = buckets.get(key) ?? { count: 0, resetAt: now + windowMs };
  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + windowMs;
  }
  entry.count++;
  buckets.set(key, entry);
  return entry.count > limit;
}
