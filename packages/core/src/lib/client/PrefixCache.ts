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
  readonly #inFlight = new Map<string, Promise<string[]>>();
  #inFlightGlobal: Promise<string> | null = null;

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
    if (this.#guildCache.has(guildId)) {
      this.#guildCache.delete(guildId);
    } else if (this.#guildCache.size >= this.#maxEntries) {
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

  public async getOrFetch(
    guildId: string,
    fetcher: () => Promise<string[]>,
    ttlMs?: number,
  ): Promise<string[]> {
    const cached = this.get(guildId);
    if (cached !== null) return cached;

    const existing = this.#inFlight.get(guildId);
    if (existing) return existing;

    const promise = (async () => {
      try {
        const result = await fetcher();
        this.set(guildId, result, ttlMs);
        return result;
      } finally {
        this.#inFlight.delete(guildId);
      }
    })();

    this.#inFlight.set(guildId, promise);
    return promise;
  }

  public delete(guildId: string): boolean {
    this.#inFlight.delete(guildId);
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

  public async getOrFetchGlobal(
    fetcher: () => Promise<string>,
    ttlMs?: number,
  ): Promise<string> {
    const cached = this.getGlobal();
    if (cached !== null) return cached;

    if (this.#inFlightGlobal) return this.#inFlightGlobal;

    const promise = (async () => {
      try {
        const result = await fetcher();
        this.setGlobal(result, ttlMs);
        return result;
      } finally {
        this.#inFlightGlobal = null;
      }
    })();

    this.#inFlightGlobal = promise;
    return promise;
  }

  public deleteGlobal(): void {
    this.#globalEntry = null;
    this.#inFlightGlobal = null;
  }

  public clear(): void {
    this.#guildCache.clear();
    this.#globalEntry = null;
    this.#inFlight.clear();
    this.#inFlightGlobal = null;
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
