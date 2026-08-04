import type { Redis } from "ioredis";
import { type ILogger, container } from "@sapphire/framework";
import { cacheHits, cacheMisses } from "@lumi/observability";
import { cacheFenceKey } from "#lib/database/redis.js";
import type { DatabaseClient } from "#lib/prisma/client.js";
import type { DatabaseService } from "#lib/prisma/DatabaseService.js";

const inflight = new Map<string, Promise<unknown>>();

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

    const pending = inflight.get(key);
    if (pending) return pending as Promise<T>;

    const flight = (async () => {
      // Fence against a concurrent write's invalidate() firing mid-fetch:
      // if the fence marker changed while fetcher() was running, a write
      // touched this key after we started reading, so what we just fetched
      // may already be stale relative to it - skip repopulating the shared
      // cache with it (this caller still gets the value it fetched, just
      // doesn't write it back). Correct regardless of how long the fetch
      // takes, unlike a fixed-delay double-delete.
      const fenceKey = cacheFenceKey(key);
      const fenceBefore = await this.redis.get(fenceKey);
      const data = await fetcher();
      const fenceAfter = await this.redis.get(fenceKey);
      if (fenceAfter === fenceBefore) {
        const serialized = JSON.stringify(data);
        if (serialized !== undefined) {
          await this.redis.setex(key, ttl, serialized);
        }
      } else {
        this.logger.debug(
          `[cache] Skipped repopulating ${key} - invalidated while fetching`,
        );
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
