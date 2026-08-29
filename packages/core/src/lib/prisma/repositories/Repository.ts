import type { RedisClient } from "#lib/database/cluster-safe.js";
import { type ILogger, container } from "@sapphire/framework";
import { cacheHits, cacheMisses } from "@lumi/observability";
import type { DatabaseClient } from "#lib/prisma/client.js";
import type { DatabaseService } from "#lib/prisma/DatabaseService.js";

const inflight = new Map<string, Promise<unknown>>();

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

    const pending = inflight.get(key);
    if (pending) return pending as Promise<T>;

    const flight = (async () => {
      const data = await fetcher();
      const serialized = serializer(data);
      if (serialized !== undefined) {
        await this.redis.setex(key, ttl, serialized);
      }
      return data;
    })();
    inflight.set(key, flight);
    try {
      return await flight;
    } finally {
      inflight.delete(key);
    }
  }
}
