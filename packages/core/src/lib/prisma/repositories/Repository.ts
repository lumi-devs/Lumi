import type { ValkeyClient } from "@lumi/infrastructure/database";
import { type ILogger } from "@lumi/shared";
import type { DatabaseClient } from "#lib/prisma/client.js";
import type { DatabaseService } from "#lib/prisma/DatabaseService.js";

/** Base class for per-domain database repositories. */
export abstract class Repository {
  public constructor(
    protected readonly prisma: DatabaseClient,
    protected readonly valkey: ValkeyClient,
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
    // Dynamic import: this module sits inside the services → DatabaseService
    // → repositories import chain, so a static import of either target
    // evaluates while a repository subclass is still extending this base.
    const { container } = await import("#lib/services.js");
    await container.invalidation.invalidate(...keys);
  }

  protected async getOrSet<T>(
    key: string,
    ttl: number,
    fetcher: () => Promise<T>,
    parser: (data: string) => T = JSON.parse,
    serializer: (data: T) => string = JSON.stringify,
  ): Promise<T> {
    const { repositoryCache } = await import("#lib/cache/CacheStore.js");
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
