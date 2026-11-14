import type {RedisClient} from "@redis/Cluster.js";
import { type ILogger } from "@shared/Index.ts";
import type { DatabaseClient } from "@db/Client.js";
import type { DatabaseService } from "@db/DatabaseService.js";

export abstract class Repository {
  public constructor(
    protected readonly prisma: DatabaseClient,
    protected readonly redis: RedisClient,
    protected readonly logger: ILogger,
    protected readonly db: DatabaseService,

    protected readonly reader: DatabaseClient = prisma,
  ) {}

  protected async invalidate(...keys: string[]): Promise<void> {

    const { container } = await import("@lib/Services.js");
    await container.invalidation.invalidate(...keys);
  }

  protected async getOrSet<T>(
    key: string,
    ttl: number,
    fetcher: () => Promise<T>,
    parser: (data: string) => T = JSON.parse,
    serializer: (data: T) => string = JSON.stringify,
  ): Promise<T> {
    const { repositoryCache } = await import("@cache/CacheStore.js");
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
