import type { ValkeyClient } from "../database/cluster-safe.js";
import { InvalidationBus } from "../cache/valkey.js";
import { acquireValkeyLock, verifyValkeyLock, type ValkeyLock, type ValkeyLockOptions } from "../cache/lock.js";
import type { CacheLogger, ICacheStore } from "../cache/types.js";

export class CacheService implements ICacheStore {
  readonly #valkey: ValkeyClient;
  readonly #invalidation?: InvalidationBus;
  readonly #logger?: CacheLogger;

  public constructor(options: {
    valkey: ValkeyClient;
    invalidation?: InvalidationBus;
    logger?: CacheLogger;
  }) {
    this.#valkey = options.valkey;
    this.#invalidation = options.invalidation;
    this.#logger = options.logger;
  }

  public get valkey(): ValkeyClient {
    return this.#valkey;
  }

  public get invalidation(): InvalidationBus | undefined {
    return this.#invalidation;
  }

  public async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.#valkey.get(key);
      if (raw === null) return null;
      return JSON.parse(raw) as T;
    } catch (err) {
      this.#logger?.warn?.(`[CacheService] Failed to read key "${key}":`, err);
      return null;
    }
  }

  public async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    try {
      const raw = JSON.stringify(value);
      if (ttlSeconds && ttlSeconds > 0) {
        await this.#valkey.set(key, raw, "EX", ttlSeconds);
      } else {
        await this.#valkey.set(key, raw);
      }
    } catch (err) {
      this.#logger?.warn?.(`[CacheService] Failed to write key "${key}":`, err);
    }
  }

  public async del(...keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    try {
      if (this.#invalidation) {
        await this.#invalidation.invalidate(...keys);
      } else {
        await this.#valkey.del(...keys);
      }
    } catch (err) {
      this.#logger?.warn?.(`[CacheService] Failed to delete keys:`, err);
    }
  }

  public async has(key: string): Promise<boolean> {
    try {
      const count = await this.#valkey.exists(key);
      return count > 0;
    } catch {
      return false;
    }
  }

  public async getOrSet<T>(
    key: string,
    ttlSeconds: number,
    producer: () => Promise<T>,
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    const fresh = await producer();
    if (fresh !== undefined && fresh !== null) {
      await this.set(key, fresh, ttlSeconds);
    }
    return fresh;
  }

  public async acquireLock(
    key: string,
    options?: ValkeyLockOptions,
  ): Promise<ValkeyLock> {
    return acquireValkeyLock(this.#valkey, key, {
      ...options,
      logger: options?.logger ?? this.#logger,
    });
  }

  public async verifyLock(key: string, token: string): Promise<boolean> {
    return verifyValkeyLock(this.#valkey, key, token);
  }
}
