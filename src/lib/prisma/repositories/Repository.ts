import { type ILogger } from "#src/shared/Index.ts";
import type { DatabaseClient } from "#src/lib/prisma/Client.js";
import type { DatabaseService } from "#src/lib/prisma/DatabaseService.js";
import { cacheStore } from "#src/lib/cache/CacheStore.js";
import { invalidationBus } from "#src/lib/cache/Signals.js";

export abstract class Repository {
  public constructor(
    protected readonly prisma: DatabaseClient,
    protected readonly logger: ILogger,
    protected readonly db: DatabaseService,
    protected readonly reader: DatabaseClient = prisma,
  ) {}

  protected invalidate(...keys: string[]): void {
    invalidationBus.invalidate(...keys);
    for (const k of keys) {
      cacheStore.delete(k);
    }
  }

  protected async getOrSet<T>(
    key: string,
    ttlSeconds: number,
    fetcher: () => Promise<T>,
  ): Promise<T> {
    return cacheStore.getOrLoad(key, ttlSeconds * 1000, fetcher);
  }
}
