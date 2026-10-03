import type { IDatabaseClient } from "./types.js";
import type { RedisClient } from "./cluster-safe.js";

export interface RepositoryLogger {
  debug?(message: string, ...args: unknown[]): void;
  info?(message: string, ...args: unknown[]): void;
  warn?(message: string, ...args: unknown[]): void;
  error?(message: string, ...args: unknown[]): void;
}

export interface InvalidationEmitter {
  invalidate(...keys: string[]): Promise<void>;
}

export abstract class BaseRepository {
  protected constructor(
    protected readonly db: IDatabaseClient,
    protected readonly redis?: RedisClient,
    protected readonly invalidation?: InvalidationEmitter,
    protected readonly logger?: RepositoryLogger,
  ) {}

  protected async getOrSetCache<V>(
    key: string,
    ttlSeconds: number,
    fetcher: () => Promise<V>,
  ): Promise<V> {
    if (!this.redis) return fetcher();

    try {
      const cached = await this.redis.get(key);
      if (cached !== null) {
        return JSON.parse(cached) as V;
      }
    } catch (err) {
      this.logger?.warn?.(`[Repository] Cache read failed for key ${key}`, err);
    }

    const value = await fetcher();

    if (value !== undefined && value !== null) {
      try {
        await this.redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
      } catch (err) {
        this.logger?.warn?.(`[Repository] Cache write failed for key ${key}`, err);
      }
    }

    return value;
  }

  protected async invalidateCache(...keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    if (this.invalidation) {
      await this.invalidation.invalidate(...keys);
    } else if (this.redis) {
      await this.redis.del(...keys);
    }
  }
}
