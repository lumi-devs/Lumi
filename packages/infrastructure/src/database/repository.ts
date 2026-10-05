import type { IDatabaseClient } from "./types.js";
import type { ValkeyClient } from "./cluster-safe.js";

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
    protected readonly valkey?: ValkeyClient,
    protected readonly invalidation?: InvalidationEmitter,
    protected readonly logger?: RepositoryLogger,
  ) {}

  protected async getOrSetCache<V>(
    key: string,
    ttlSeconds: number,
    fetcher: () => Promise<V>,
  ): Promise<V> {
    if (!this.valkey) return fetcher();

    try {
      const cached = await this.valkey.get(key);
      if (cached !== null) {
        return JSON.parse(cached) as V;
      }
    } catch (err) {
      this.logger?.warn?.(`[Repository] Cache read failed for key ${key}`, err);
    }

    const value = await fetcher();

    if (value !== undefined && value !== null) {
      try {
        await this.valkey.set(key, JSON.stringify(value), "EX", ttlSeconds);
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
    } else if (this.valkey) {
      await this.valkey.del(...keys);
    }
  }
}
