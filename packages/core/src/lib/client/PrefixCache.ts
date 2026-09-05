import type { InvalidationBus } from "#lib/database/redis.js";

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const DefaultTtlMs = 300_000; // 5 minutes (matches RedisTTL.guildPrefix)
const DefaultMaxEntries = 5_000;
const PrefixKeyPattern = /^lumi:(?:prefix|settings|cfg:core):guild:([a-zA-Z0-9_-]+)$/;

export class PrefixCache {
  readonly #guildCache = new Map<string, CacheEntry<string[]>>();
  #globalEntry: CacheEntry<string> | null = null;
  readonly #maxEntries: number;
  readonly #defaultTtlMs: number;

  public constructor(options?: { maxEntries?: number; defaultTtlMs?: number }) {
    this.#maxEntries = options?.maxEntries ?? DefaultMaxEntries;
    this.#defaultTtlMs = options?.defaultTtlMs ?? DefaultTtlMs;
  }

  public get(guildId: string): string[] | null {
    const entry = this.#guildCache.get(guildId);
    if (!entry) return null;
    if (Date.now() >= entry.expiresAt) {
      this.#guildCache.delete(guildId);
      return null;
    }
    return entry.value;
  }

  public set(guildId: string, prefixes: string[], ttlMs?: number): void {
    if (this.#guildCache.size >= this.#maxEntries && !this.#guildCache.has(guildId)) {
      const oldestKey = this.#guildCache.keys().next().value;
      if (oldestKey !== undefined) {
        this.#guildCache.delete(oldestKey);
      }
    }
    this.#guildCache.set(guildId, {
      value: prefixes,
      expiresAt: Date.now() + (ttlMs ?? this.#defaultTtlMs),
    });
  }

  public delete(guildId: string): boolean {
    return this.#guildCache.delete(guildId);
  }

  public getGlobal(): string | null {
    if (!this.#globalEntry) return null;
    if (Date.now() >= this.#globalEntry.expiresAt) {
      this.#globalEntry = null;
      return null;
    }
    return this.#globalEntry.value;
  }

  public setGlobal(prefix: string, ttlMs?: number): void {
    this.#globalEntry = {
      value: prefix,
      expiresAt: Date.now() + (ttlMs ?? this.#defaultTtlMs),
    };
  }

  public deleteGlobal(): void {
    this.#globalEntry = null;
  }

  public clear(): void {
    this.#guildCache.clear();
    this.#globalEntry = null;
  }

  public get size(): number {
    return this.#guildCache.size;
  }

  public handleInvalidations(keys: string[]): void {
    for (const key of keys) {
      if (key === "lumi:cfg:global" || key === "*") {
        this.clear();
        continue;
      }
      const match = PrefixKeyPattern.exec(key);
      if (match?.[1]) {
        this.delete(match[1]);
      }
    }
  }

  public attachToInvalidationBus(bus: InvalidationBus): () => void {
    const unbindInvalidate = bus.onInvalidate((keys) => {
      this.handleInvalidations(keys);
    });
    const unbindResync = bus.onResync(() => {
      this.clear();
    });

    return () => {
      unbindInvalidate();
      unbindResync();
      this.clear();
    };
  }
}
