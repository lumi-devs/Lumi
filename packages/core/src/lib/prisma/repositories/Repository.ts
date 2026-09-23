import type { RedisClient } from "#lib/database/cluster-safe.js";
import { CacheStore } from "#lib/cache/CacheStore.js";
import { type ILogger, container } from "@sapphire/framework";
import type { DatabaseClient } from "#lib/prisma/client.js";
import type { DatabaseService } from "#lib/prisma/DatabaseService.js";

export const repositoryCache = new CacheStore();

/** Base class for per-domain database repositories. */
export abstract class Repository {
  public constructor(
    protected readonly prisma: DatabaseClient,
    protected readonly redis: RedisClient,
    protected readonly logger: ILogger,
    protected readonly db: DatabaseService,
    /**
     * Read-only client for fleet-wide scans that tolerate replication lag.
     * Defaults to the writer, so single-database deployments and tests behave
     * exactly as before and nothing has to branch on whether a replica exists.
     */
    protected readonly reader: DatabaseClient = prisma,
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
    serializer: (data: T) => string = JSON.stringify,
  ): Promise<T> {
    const parseOrWarn = (data: string): T => {
      try {
        return parser(data);
      } catch (err: unknown) {
        this.logger.warn(
          `[cache] Unparseable entry for ${key}, recomputing:`,
          err,
        );
        throw err;
      }
    };
    return repositoryCache.getOrLoad(
      key,
      ttl * 1000,
      fetcher,
      parseOrWarn,
      serializer,
    );
  }
}
