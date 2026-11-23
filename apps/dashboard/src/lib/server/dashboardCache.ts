import {
  createCache,
  type CacheMetrics,
  type CacheRedis,
  type NamespacedCache,
} from "@lumi/cache";
import { getInvalidationBus, getRedis } from "./redis.js";
import { logger } from "@lumi/foundation";
import type { GuildSummary } from "./discord.js";
import type { CatalogModule } from "./modules.js";

const globalForDashboardCache = globalThis as typeof globalThis & {
  __lumiDashboardCache?: DashboardCache;
};

export interface DashboardCache {
  userGuilds: NamespacedCache<GuildSummary[]>;
  moduleCatalog: NamespacedCache<CatalogModule[]>;
  close(): Promise<void>;
}

type DashboardCacheMetrics = CacheMetrics & {
  getStats(): Record<string, unknown>;
};

function createDashboardCacheMetrics(): DashboardCacheMetrics {
  const hits = new Map<string, number>();
  const misses = new Map<string, number>();
  const negativeHits = new Map<string, number>();
  const writes = new Map<string, number>();
  const evictions = new Map<string, number>();
  const invalidations = new Map<string, number>();
  const fillDurations = new Map<string, number[]>();

  return {
    recordHit(namespace: string) {
      hits.set(namespace, (hits.get(namespace) ?? 0) + 1);
    },
    recordMiss(namespace: string) {
      misses.set(namespace, (misses.get(namespace) ?? 0) + 1);
    },
    recordNegativeHit(namespace: string) {
      negativeHits.set(namespace, (negativeHits.get(namespace) ?? 0) + 1);
    },
    recordWrite(namespace: string) {
      writes.set(namespace, (writes.get(namespace) ?? 0) + 1);
    },
    recordEviction(namespace: string) {
      evictions.set(namespace, (evictions.get(namespace) ?? 0) + 1);
    },
    recordInvalidation(namespace: string) {
      invalidations.set(namespace, (invalidations.get(namespace) ?? 0) + 1);
    },
    recordFillDuration(namespace: string, durationMs: number) {
      const arr = fillDurations.get(namespace) ?? [];
      arr.push(durationMs);
      if (arr.length > 100) arr.shift();
      fillDurations.set(namespace, arr);
    },
    recordStaleWrite(namespace: string) {
      logger.debug("stale write", { namespace });
    },
    getStats() {
      const namespaces = new Set([
        ...hits.keys(),
        ...misses.keys(),
        ...negativeHits.keys(),
        ...writes.keys(),
        ...evictions.keys(),
        ...invalidations.keys(),
        ...fillDurations.keys(),
      ]);
      const stats: Record<string, unknown> = {};
      for (const ns of namespaces) {
        const durations = fillDurations.get(ns) ?? [];
        const avgFill =
          durations.length > 0
            ? durations.reduce((a, b) => a + b, 0) / durations.length
            : 0;
        stats[ns] = {
          hits: hits.get(ns) ?? 0,
          misses: misses.get(ns) ?? 0,
          negativeHits: negativeHits.get(ns) ?? 0,
          writes: writes.get(ns) ?? 0,
          evictions: evictions.get(ns) ?? 0,
          invalidations: invalidations.get(ns) ?? 0,
          avgFillDurationMs: Math.round(avgFill),
        };
      }
      return stats;
    },
  };
}

const dashboardCacheMetrics = createDashboardCacheMetrics();

function createCacheRedis(): CacheRedis {
  const redis = getRedis();
  return {
    async get(key: string) {
      return redis.get(key);
    },
    async set(key: string, value: string, _unit: "PX", ttlMs: number) {
      return redis.set(key, value, "PX", ttlMs);
    },
    async del(...keys: string[]) {
      if (keys.length === 0) return 0;
      return redis.del(...keys);
    },
    async mget(...keys: string[]) {
      if (keys.length === 0) return [];
      return redis.mget(...keys);
    },
  };
}

function createDashboardCache(): DashboardCache {
  const redis = createCacheRedis();
  const invalidation = getInvalidationBus();
  const metrics = dashboardCacheMetrics;

  const userGuildsCache = createCache<GuildSummary[]>({
    redis,
    invalidation,
    metrics,
    defaultTtlMs: 45_000,
    defaultNegativeTtlMs: 5_000,
    l1MaxSize: 500,
    l1MaxTtlMs: 30_000,
  }).namespace("userGuilds");

  const moduleCatalogCache = createCache<CatalogModule[]>({
    redis,
    invalidation,
    metrics,
    defaultTtlMs: 60_000,
    defaultNegativeTtlMs: 10_000,
    l1MaxSize: 200,
    l1MaxTtlMs: 30_000,
  }).namespace("moduleCatalog");

  return {
    userGuilds: userGuildsCache,
    moduleCatalog: moduleCatalogCache,
    async close() {
      await invalidation.close();
    },
  };
}

export function getDashboardCache(): DashboardCache {
  if (globalForDashboardCache.__lumiDashboardCache) {
    return globalForDashboardCache.__lumiDashboardCache;
  }
  const cache = createDashboardCache();
  globalForDashboardCache.__lumiDashboardCache = cache;
  return cache;
}

export function getDashboardCacheStats() {
  return dashboardCacheMetrics.getStats();
}
