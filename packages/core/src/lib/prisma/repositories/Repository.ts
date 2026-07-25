import type { Redis } from "ioredis";
import { type ILogger, container } from "@sapphire/framework";
import { cacheHits, cacheMisses } from "@lumi/observability";
import type { DatabaseClient } from "#lib/prisma/client.js";
import type { DatabaseService } from "#lib/prisma/DatabaseService.js";

/** Base class for per-domain database repositories. */
export abstract class Repository {
  public constructor(
    protected readonly prisma: DatabaseClient,
    protected readonly redis: Redis,
    protected readonly logger: ILogger,
    protected readonly db: DatabaseService,
  ) {}

  /** Invalidates cache keys across all peers via the InvalidationBus. */
  protected async invalidate(...keys: string[]): Promise<void> {
    await container.invalidation.invalidate(...keys);
  }

  protected async getOrSet<T>(
    key: string,
    ttl: number,
    fetcher: () => Promise<T>,
    parser: (data: string) => T = JSON.parse,
  ): Promise<T> {
    const cache = key.split(":")[1] ?? "unknown";
    const cached = await this.redis.get(key);
    if (cached) {
      try {
        const value = parser(cached);
        cacheHits.inc({ cache });
        return value;
      } catch (err: unknown) {
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
