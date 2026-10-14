import { cacheHits, cacheMisses } from "#src/observability/Index.ts";

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export interface CacheOptions {
  max?: number;
  ttl?: number;
}

export class MemoryCache {
  readonly #max: number;
  readonly #defaultTtl: number;
  readonly #cache = new Map<string, CacheEntry<any>>();
  readonly #oldCache = new Map<string, CacheEntry<any>>();
  readonly #inflight = new Map<string, Promise<any>>();
  #size = 0;

  public constructor(options: CacheOptions = {}) {
    this.#max = options.max && options.max > 0 ? options.max : 5_000;
    this.#defaultTtl = options.ttl && options.ttl > 0 ? options.ttl : 60_000;
  }

  public get<T = unknown>(key: string): T | undefined {
    let entry = this.#cache.get(key);
    if (entry) {
      if (Date.now() >= entry.expiresAt) {
        this.#cache.delete(key);
        this.#size--;
        return undefined;
      }
      return entry.value as T;
    }

    entry = this.#oldCache.get(key);
    if (entry) {
      if (Date.now() >= entry.expiresAt) {
        this.#oldCache.delete(key);
        return undefined;
      }
      this.#oldCache.delete(key);
      this.set(key, entry.value, entry.expiresAt - Date.now());
      return entry.value as T;
    }

    return undefined;
  }

  public set<T = unknown>(key: string, value: T, ttlMs = this.#defaultTtl): this {
    const expiresAt = Date.now() + Math.max(1, ttlMs);
    const entry: CacheEntry<T> = { value, expiresAt };

    if (this.#cache.has(key)) {
      this.#cache.set(key, entry);
      return this;
    }

    this.#cache.set(key, entry);
    this.#size++;

    if (this.#size >= this.#max) {
      this.#size = 0;
      this.#oldCache.clear();
      for (const [k, v] of this.#cache) {
        this.#oldCache.set(k, v);
      }
      this.#cache.clear();
    }

    return this;
  }

  public has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  public setIfAbsent<T = unknown>(key: string, value: T, ttlMs = this.#defaultTtl): boolean {
    if (this.has(key)) return false;
    this.set(key, value, ttlMs);
    return true;
  }

  public delete(key: string): boolean {
    const deleted = this.#cache.delete(key);
    if (deleted) this.#size--;
    return this.#oldCache.delete(key) || deleted;
  }

  public clear(): void {
    this.#cache.clear();
    this.#oldCache.clear();
    this.#inflight.clear();
    this.#size = 0;
  }

  public get size(): number {
    return this.#size + this.#oldCache.size;
  }

  public async getOrLoad<T = unknown>(
    key: string,
    ttlMs: number,
    loader: () => Promise<T>,
  ): Promise<T> {
    const namespace = key.split(":")[1] ?? "app";
    const cached = this.get<T>(key);
    if (cached !== undefined) {
      cacheHits.inc({ cache: namespace });
      return cached;
    }

    const pending = this.#inflight.get(key);
    if (pending) return pending as Promise<T>;

    cacheMisses.inc({ cache: namespace });

    const flight = (async (): Promise<T> => {
      try {
        const val = await loader();
        if (val !== undefined && val !== null) {
          this.set(key, val, ttlMs);
        }
        return val;
      } finally {
        this.#inflight.delete(key);
      }
    })();

    this.#inflight.set(key, flight);
    return flight;
  }
}

export const cacheStore = new MemoryCache();
