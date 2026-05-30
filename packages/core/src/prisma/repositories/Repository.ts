import type { Redis } from "ioredis";
import { type ILogger, container } from "@sapphire/framework";
import { cacheHits, cacheMisses } from "@ember/observability";
import type { EmberPrismaClient } from "#database/client.js";
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
    protected readonly prisma: EmberPrismaClient,
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
    const cache = key.split(":", 1)[0] ?? "unknown";
    const cached = await this.redis.get(key);
    if (cached) {
      cacheHits.inc({ cache });
      return parser(cached);
    }
    cacheMisses.inc({ cache });

    const data = await fetcher();
    await this.redis.setex(key, ttl, JSON.stringify(data));
    return data;
  }
}
