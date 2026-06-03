import type { Redis } from "ioredis";
import { type ILogger, container } from "@sapphire/framework";
import { cacheHits, cacheMisses } from "@lumi-devs/observability";
import type { DatabaseClient } from "#database/client.js";
import type { DatabaseService } from "#root/prisma/DatabaseService.js";

/**
 * Base class for every per-domain repository.  Owns the shared Prisma/Redis
 * handles, the cache-aside `getOrSet` primitive, and `invalidate` (which routes
 * cache busts through the `InvalidationBus` so peer processes drop their copies
 * too).  Each repo owns its own tables + Redis keys/TTLs; cross-domain reads go
 * through `this.db.<repo>` (the facade), never by reaching for another repo's
 * Prisma models directly.
 */
export abstract class Repository {
  public constructor(
    protected readonly prisma: DatabaseClient,
    protected readonly redis: Redis,
    protected readonly logger: ILogger,
    protected readonly db: DatabaseService,
  ) {}

  /** Route all cache busts through the InvalidationBus so peers drop their memos too. */
  protected async invalidate(...keys: string[]): Promise<void> {
    await container.invalidation.invalidate(...keys);
  }

  protected async getOrSet<T>(
    key: string,
    ttl: number,
    fetcher: () => Promise<T>,
    parser: (data: string) => T = JSON.parse,
  ): Promise<T> {
    // Keys are `lumi:{namespace}:…` — split on the second colon to get the
    // namespace segment as the metric label (e.g. "settings", "cfg", "perms").
    const cache = key.split(":")[1] ?? "unknown";
    const cached = await this.redis.get(key);
    if (cached) {
      try {
        const value = parser(cached);
        cacheHits.inc({ cache });
        return value;
      } catch (err: unknown) {
        // Corrupt/stale cache entry — discard, treat as a miss, and recompute
        // (the fetch below overwrites the bad value) rather than throwing.
        this.logger.warn(
          `[cache] Unparseable entry for ${key}, recomputing:`,
          err,
        );
      }
    }
    cacheMisses.inc({ cache });

    const data = await fetcher();
    await this.redis.setex(key, ttl, JSON.stringify(data));
    return data;
  }
}
