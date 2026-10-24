import { Time } from "@lumi/foundation";
import { noopCacheMetrics, type CacheMetrics } from "@lumi/observability";
import type { InvalidationPort } from "@lumi/redis";
import { codec, type Codec } from "./codec.ts";
import type { CacheRedis } from "./redis-port.ts";

const DefaultL1MaxEntries = 10_000;
const DefaultL1TtlMs = 5_000;
const DefaultNegativeTtlMs = 15_000;
const DefaultLoadTimeoutMs = 10_000;
const DefaultJitter = 0.1;

interface Entry {
  value: unknown;
  expiresAt: number;
}

interface Flight {
  promise: Promise<unknown>;
  discarded: boolean;
}

export interface CacheOptions {
  redis: CacheRedis;
  invalidation?: InvalidationPort | undefined;
  metrics?: CacheMetrics | undefined;
  codec?: Codec | undefined;
  l1MaxEntries?: number | undefined;
  l1TtlMs?: number | undefined;
  negativeTtlMs?: number | undefined;
  loadTimeoutMs?: number | undefined;
  jitter?: number | undefined;
  now?: (() => number) | undefined;
  random?: (() => number) | undefined;
}

export interface LoadOptions {
  negativeTtlMs?: number | undefined;
  timeoutMs?: number | undefined;
}

export class Cache {
  readonly #redis: CacheRedis;
  readonly #invalidation: InvalidationPort | undefined;
  readonly #metrics: CacheMetrics;
  readonly #codec: Codec;
  readonly #l1MaxEntries: number;
  readonly #l1TtlMs: number;
  readonly #negativeTtlMs: number;
  readonly #loadTimeoutMs: number;
  readonly #jitter: number;
  readonly #now: () => number;
  readonly #random: () => number;
  readonly #entries = new Map<string, Entry>();
  readonly #flights = new Map<string, Flight>();

  public constructor(options: CacheOptions) {
    this.#redis = options.redis;
    this.#invalidation = options.invalidation;
    this.#metrics = options.metrics ?? noopCacheMetrics;
    this.#codec = options.codec ?? codec;
    this.#l1MaxEntries = options.l1MaxEntries ?? DefaultL1MaxEntries;
    this.#l1TtlMs = options.l1TtlMs ?? DefaultL1TtlMs;
    this.#negativeTtlMs = options.negativeTtlMs ?? DefaultNegativeTtlMs;
    this.#loadTimeoutMs = options.loadTimeoutMs ?? DefaultLoadTimeoutMs;
    this.#jitter = options.jitter ?? DefaultJitter;
    this.#now = options.now ?? Date.now;
    this.#random = options.random ?? Math.random;

    options.invalidation?.onInvalidate((keys) => this.#dropLocal(keys));
    options.invalidation?.onResync(() => this.clearLocal());
  }

  public namespace(name: string): NamespacedCache {
    return new NamespacedCache(this, name);
  }

  public async getOrLoad<T>(
    name: string,
    key: string,
    ttlMs: number,
    load: () => Promise<T | null | undefined>,
    options?: LoadOptions,
  ): Promise<T | null> {
    // Fast path: L1 hit (single Map lookup, no decode)
    const entry = this.#entries.get(key);
    if (entry && entry.expiresAt > this.#now()) {
      if (entry.value === null) this.#metrics.negative(name);
      else this.#metrics.hit(name);
      return entry.value as T | null;
    }

    // Stampede protection: share one load across concurrent callers
    const existingFlight = this.#flights.get(key);
    if (existingFlight) return existingFlight.promise as Promise<T | null>;

    const flight: Flight = { promise: Promise.resolve(null), discarded: false };
    flight.promise = this.#load(name, key, ttlMs, load, flight, options);
    this.#flights.set(key, flight);
    return flight.promise as Promise<T | null>;
  }

  public async getMany<T>(name: string, keys: readonly string[]): Promise<Array<T | null>> {
    if (keys.length === 0) return [];
    const result = new Array<T | null>(keys.length);
    const missing: { index: number; key: string }[] = [];

    // Single pass: check L1 for all keys
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]!;
      const entry = this.#entries.get(key);
      if (entry && entry.expiresAt > this.#now()) {
        result[i] = entry.value as T | null;
        if (entry.value === null) this.#metrics.negative(name);
        else this.#metrics.hit(name);
      } else {
        missing.push({ index: i, key });
      }
    }

    if (missing.length === 0) return result;

    // Batch fetch missing keys from Redis (single mget)
    const missingKeys = missing.map((m) => m.key);
    const raw = await this.#redis.mget(...missingKeys);

    // Decode and populate L1 for hits
    for (let i = 0; i < missing.length; i++) {
      const { index, key } = missing[i]!;
      const payload = raw[i] ?? null;
      if (payload === null) {
        this.#metrics.miss(name);
        result[index] = null;
        continue;
      }
      try {
        const value = this.#codec.decode(payload) as T | null;
        result[index] = value;
        this.#remember(key, value, this.#l1TtlMs);
        if (value === null) this.#metrics.negative(name);
        else this.#metrics.hit(name);
      } catch {
        this.#metrics.miss(name);
        result[index] = null;
      }
    }

    return result;
  }

  public async set<T>(name: string, key: string, value: T, ttlMs: number): Promise<void> {
    this.#remember(key, value, Math.min(this.#l1TtlMs, ttlMs));
    this.#metrics.write(name);
    await this.#redis.setex(key, this.#seconds(ttlMs), this.#codec.encode(value));
  }

  public async delete(name: string, ...keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    this.#dropLocal(keys);
    this.#metrics.invalidate(name, keys.length);
    if (this.#invalidation) {
      await this.#invalidation.invalidate(...keys);
      return;
    }
    await this.#redis.del(...keys);
  }

  public clearLocal(): void {
    this.#entries.clear();
    for (const flight of this.#flights.values()) flight.discarded = true;
    this.#flights.clear();
  }

  public localSize(): number {
    return this.#entries.size;
  }

  async #load<T>(
    name: string,
    key: string,
    ttlMs: number,
    load: () => Promise<T | null | undefined>,
    flight: Flight,
    options?: LoadOptions,
  ): Promise<T | null> {
    try {
      // Try Redis L2 first (single get)
      let payload: string | null = null;
      try {
        payload = await this.#redis.get(key);
      } catch {
        payload = null;
      }

      if (payload !== null) {
        try {
          const value = this.#codec.decode(payload) as T | null;
          this.#remember(key, value, this.#l1TtlMs);
          if (value === null) this.#metrics.negative(name);
          else this.#metrics.hit(name);
          return value;
        } catch {
          await this.#redis.del(key).catch(() => undefined);
        }
      }

      this.#metrics.miss(name);
      const started = performance.now();
      const data = await this.#withTimeout(load, options?.timeoutMs ?? this.#loadTimeoutMs);
      this.#metrics.fill(name, (performance.now() - started) / 1_000);

      if (flight.discarded) {
        this.#metrics.stale(name);
        return (data ?? null) as T | null;
      }

      if (data === null || data === undefined) {
        const negativeTtl = options?.negativeTtlMs ?? this.#negativeTtlMs;
        const ttl = Math.min(negativeTtl, this.#l1TtlMs);
        this.#remember(key, null, ttl);
        this.#metrics.negative(name);
        this.#metrics.write(name);
        await this.#redis
          .setex(key, this.#seconds(negativeTtl), this.#codec.encode(null))
          .catch(() => undefined);
        return null;
      }

      this.#remember(key, data, Math.min(this.#l1TtlMs, ttlMs));
      this.#metrics.write(name);
      await this.#redis
        .setex(key, this.#seconds(this.#jittered(ttlMs)), this.#codec.encode(data))
        .catch(() => undefined);
      return data;
    } finally {
      if (this.#flights.get(key) === flight) this.#flights.delete(key);
    }
  }

  #withTimeout<T>(load: () => Promise<T>, timeoutMs: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Cache load timed out after ${timeoutMs}ms`)), timeoutMs);
    });
    return Promise.race([load(), timeout]).finally(() => {
      if (timer !== undefined) clearTimeout(timer);
    }) as Promise<T>;
  }

  #remember(key: string, value: unknown, ttlMs: number): void {
    const expiresAt = this.#now() + Math.max(1, ttlMs);
    this.#entries.set(key, { value, expiresAt });
    if (this.#entries.size <= this.#l1MaxEntries) return;
    // Evict oldest (Map preserves insertion order)
    const oldestKey = this.#entries.keys().next().value;
    if (oldestKey !== undefined) {
      this.#entries.delete(oldestKey);
      // We don't have the namespace name here; metrics will be approximate
      // but eviction is rare enough that this is acceptable.
    }
  }

  #dropLocal(keys: readonly string[]): void {
    for (const key of keys) {
      this.#entries.delete(key);
      const flight = this.#flights.get(key);
      if (flight) {
        flight.discarded = true;
        this.#flights.delete(key);
      }
    }
  }

  #jittered(ttlMs: number): number {
    const factor = 1 + (this.#random() * 2 - 1) * this.#jitter;
    return Math.max(Time.Second, ttlMs * factor);
  }

  #seconds(ttlMs: number): number {
    return Math.max(1, Math.ceil(ttlMs / 1_000));
  }
}

export class NamespacedCache {
  readonly #cache: Cache;
  readonly #name: string;

  public constructor(cache: Cache, name: string) {
    this.#cache = cache;
    this.#name = name;
  }

  public getOrLoad<T>(
    key: string,
    ttlMs: number,
    load: () => Promise<T | null | undefined>,
    options?: LoadOptions,
  ): Promise<T | null> {
    return this.#cache.getOrLoad(this.#name, key, ttlMs, load, options);
  }

  public getMany<T>(keys: readonly string[]): Promise<Array<T | null>> {
    return this.#cache.getMany<T>(this.#name, keys);
  }

  public set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    return this.#cache.set(this.#name, key, value, ttlMs);
  }

  public delete(...keys: string[]): Promise<void> {
    return this.#cache.delete(this.#name, ...keys);
  }
}