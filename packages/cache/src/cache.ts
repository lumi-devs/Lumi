import { type Codec, createCodec } from "./codec.js";

/**
 * Minimal Redis surface used by the cache. Kept structural so tests can use a
 * plain mock and ioredis clients satisfy it without adapters.
 */
export interface CacheRedis {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, unit: "PX", ttlMs: number): Promise<unknown>;
  del(...keys: string[]): Promise<unknown>;
  mget(...keys: string[]): Promise<(string | null)[]>;
  /**
   * Only needed for the stale-write cleanup. Optional so test doubles do not
   * have to emulate Lua; a production ioredis client always provides it.
   */
  eval?(script: string, numKeys: number, key: string, value: string): Promise<unknown>;
}

export interface CacheOptions<_T> {
  redis: CacheRedis;
  invalidation: InvalidationBus;
  metrics?: CacheMetrics;
  defaultTtlMs?: number;
  defaultNegativeTtlMs?: number;
  l1MaxSize?: number;
  l1MaxTtlMs?: number;
}

export interface InvalidationBus {
  subscribe(namespace: string, listener: (keys: string[]) => void): () => void;
  invalidate(namespace: string, keys: string[]): Promise<void>;
  onResync(): Promise<void>;
}

export interface CacheMetrics {
  recordHit(namespace: string): void;
  recordMiss(namespace: string): void;
  recordNegativeHit(namespace: string): void;
  recordWrite(namespace: string): void;
  recordEviction(namespace: string): void;
  recordInvalidation(namespace: string): void;
  recordFillDuration(namespace: string, durationMs: number): void;
  recordStaleWrite(namespace: string): void;
}

export interface NamespacedCache<T> {
  get(key: string): Promise<T | null>;
  getOrLoad(
    key: string,
    ttlMs: number,
    loader: () => Promise<T | null>,
    options?: { negativeTtlMs?: number },
  ): Promise<T | null>;
  getMany(keys: string[]): Promise<Map<string, T | null>>;
  set(key: string, value: T, ttlMs: number): Promise<void>;
  delete(...keys: string[]): Promise<void>;
  namespace(name: string): NamespacedCache<T>;
}

interface L1Entry<T> {
  value: T | null;
  expiresAt: number;
}

interface LoadFlight<T> {
  promise: Promise<T | null>;
  generation: number;
}

const DELETE_IF_VALUE_SCRIPT =
  "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";

/** State shared by a cache and all of its namespaces in one process. */
interface CacheState<T> {
  l1: Map<string, L1Entry<T>>;
  flights: Map<string, LoadFlight<T>>;
  loadGenerations: Map<string, number>;
}

export class Cache<T = unknown> implements NamespacedCache<T> {
  private readonly redis: CacheRedis;
  private readonly invalidation: InvalidationBus;
  private readonly metrics?: CacheMetrics;
  private readonly defaultTtlMs: number;
  private readonly defaultNegativeTtlMs: number;
  private readonly l1MaxSize: number;
  private readonly l1MaxTtlMs: number;
  private readonly codec: Codec<T>;

  private readonly l1: Map<string, L1Entry<T>>;
  private readonly flights: Map<string, LoadFlight<T>>;
  private readonly loadGenerations: Map<string, number>;

  private namespacePrefix = "";
  private label = "default";

  constructor(options: CacheOptions<T>, shared?: CacheState<T>) {
    this.redis = options.redis;
    this.invalidation = options.invalidation;
    this.metrics = options.metrics;
    this.defaultTtlMs = options.defaultTtlMs ?? 60_000;
    this.defaultNegativeTtlMs = options.defaultNegativeTtlMs ?? 15_000;
    this.l1MaxSize = options.l1MaxSize ?? 10_000;
    this.l1MaxTtlMs = options.l1MaxTtlMs ?? 5_000;
    this.codec = createCodec<T>();

    if (shared) {
      this.l1 = shared.l1;
      this.flights = shared.flights;
      this.loadGenerations = shared.loadGenerations;
    } else {
      this.l1 = new Map();
      this.flights = new Map();
      this.loadGenerations = new Map();
      this.setupInvalidationHandlers();
    }
  }

  private setupInvalidationHandlers(): void {
    this.invalidation.subscribe("", (keys) => {
      this.discard(keys);
    });

    void this.invalidation
      .onResync()
      .then(() => {
        this.l1.clear();
        // Loads that started before the reconnect may carry pre-outage data.
        for (const fullKey of this.flights.keys()) this.markDiscarded(fullKey);
      })
      .catch((error: unknown) => {
        console.error("cache resync failed", { error });
      });
  }

  namespace(name: string): NamespacedCache<T> {
    const child = new Cache<T>(
      {
        redis: this.redis,
        invalidation: this.invalidation,
        metrics: this.metrics,
        defaultTtlMs: this.defaultTtlMs,
        defaultNegativeTtlMs: this.defaultNegativeTtlMs,
        l1MaxSize: this.l1MaxSize,
        l1MaxTtlMs: this.l1MaxTtlMs,
      },
      {
        l1: this.l1,
        flights: this.flights,
        loadGenerations: this.loadGenerations,
      },
    );
    child.namespacePrefix = `${this.namespacePrefix}${name}:`;
    child.label = `${this.namespacePrefix}${name}`;
    return child;
  }

  private makeKey(key: string): string {
    return `${this.namespacePrefix}${key}`;
  }

  /**
   * Invalidate local entries and mark any in-flight load as discarded. The
   * generation counter makes a load that started before the invalidation skip
   * its write, so it cannot resurrect the value that was just removed.
   */
  private discard(keys: readonly string[]): void {
    for (const fullKey of keys) {
      this.discardKey(fullKey);
    }
  }

  /** Drop a single key's L1 entry and discard its in-flight load, if any. */
  private discardKey(fullKey: string): void {
    this.l1.delete(fullKey);
    this.markDiscarded(fullKey);
  }

  private markDiscarded(fullKey: string): void {
    const flight = this.flights.get(fullKey);
    if (!flight) return;
    this.loadGenerations.set(fullKey, flight.generation + 1);
    // Do not let callers arriving after the invalidation join a load whose
    // result is already known to be stale. The original callers keep their
    // reference to the promise and still receive its result.
    this.flights.delete(fullKey);
  }

  private getL1(fullKey: string): L1Entry<T> | undefined {
    const entry = this.l1.get(fullKey);
    if (!entry) return undefined;
    if (entry.expiresAt < Date.now()) {
      this.l1.delete(fullKey);
      return undefined;
    }
    // Map iteration order is insertion order; re-insert to implement LRU.
    this.l1.delete(fullKey);
    this.l1.set(fullKey, entry);
    return entry;
  }

  private recordL1Hit(value: T | null): void {
    if (value === null) this.metrics?.recordNegativeHit(this.label);
    else this.metrics?.recordHit(this.label);
  }

  private setL1(fullKey: string, value: T | null, ttlMs: number): void {
    if (this.l1.has(fullKey)) this.l1.delete(fullKey);
    while (this.l1.size >= this.l1MaxSize) {
      const oldestKey = this.l1.keys().next().value;
      if (oldestKey === undefined) break;
      this.l1.delete(oldestKey);
      this.metrics?.recordEviction(this.label);
    }
    this.l1.set(fullKey, {
      value,
      expiresAt: Date.now() + Math.min(ttlMs, this.l1MaxTtlMs),
    });
  }

  async get(key: string): Promise<T | null> {
    const fullKey = this.makeKey(key);

    const cached = this.getL1(fullKey);
    if (cached) {
      this.recordL1Hit(cached.value);
      return cached.value;
    }

    const redisValue = await this.redis.get(fullKey);
    if (redisValue === null) {
      this.metrics?.recordMiss(this.label);
      return null;
    }

    try {
      const decoded = this.codec.decode(redisValue);
      this.setL1(fullKey, decoded, this.defaultTtlMs);
      this.recordL1Hit(decoded);
      return decoded;
    } catch {
      // A value that cannot be decoded is a miss; the next load rewrites it.
      this.metrics?.recordMiss(this.label);
      return null;
    }
  }

  async getOrLoad(
    key: string,
    ttlMs: number,
    loader: () => Promise<T | null>,
    options?: { negativeTtlMs?: number },
  ): Promise<T | null> {
    const fullKey = this.makeKey(key);

    const cached = this.getL1(fullKey);
    if (cached) {
      this.recordL1Hit(cached.value);
      return cached.value;
    }

    const existingFlight = this.flights.get(fullKey);
    if (existingFlight) return existingFlight.promise;

    this.metrics?.recordMiss(this.label);

    const generation = (this.loadGenerations.get(fullKey) ?? 0) + 1;
    let resolve!: (value: T | null) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T | null>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    // Register the flight before the loader can run so a synchronous throw or
    // invalidation still finds it.
    this.flights.set(fullKey, { promise, generation });
    this.loadGenerations.set(fullKey, generation);
    void this.runFlight(
      fullKey,
      ttlMs,
      loader,
      options?.negativeTtlMs ?? this.defaultNegativeTtlMs,
      generation,
    ).then(resolve, reject);
    return promise;
  }

  /** Remove a value we wrote only if nothing newer replaced it in the meantime. */
  private async dropIfStill(fullKey: string, encoded: string): Promise<void> {
    if (this.redis.eval) {
      await this.redis.eval(DELETE_IF_VALUE_SCRIPT, 1, fullKey, encoded);
      return;
    }
    // Test doubles without Lua: the key is only present when this load won the
    // race, so an unconditional delete cannot remove another value there.
    const current = await this.redis.get(fullKey);
    if (current === encoded) await this.redis.del(fullKey);
  }

  private async runFlight(
    fullKey: string,
    ttlMs: number,
    loader: () => Promise<T | null>,
    negativeTtlMs: number,
    generation: number,
  ): Promise<T | null> {
    const startedAt = Date.now();
    try {
      const value = await loader();
      if ((this.loadGenerations.get(fullKey) ?? 0) !== generation) {
        this.metrics?.recordStaleWrite(this.label);
        return value;
      }

      const encoded = value === null ? this.codec.encodeNull() : this.codec.encode(value);
      const writeTtlMs = value === null ? negativeTtlMs : ttlMs;
      await this.redis.set(fullKey, encoded, "PX", writeTtlMs);

      if ((this.loadGenerations.get(fullKey) ?? 0) !== generation) {
        // The invalidation may have run its DEL before this SET reached Redis.
        // Delete only if the stored value is still ours; a newer explicit
        // `set` must survive this cleanup.
        this.metrics?.recordStaleWrite(this.label);
        await this.dropIfStill(fullKey, encoded).catch((error: unknown) => {
          console.error("cache stale write cleanup failed", { key: fullKey, error });
        });
        return value;
      }

      this.setL1(fullKey, value, writeTtlMs);
      if (value !== null) this.metrics?.recordWrite(this.label);
      this.metrics?.recordFillDuration(this.label, Date.now() - startedAt);
      return value;
    } finally {
      const current = this.flights.get(fullKey);
      if (current?.generation === generation) {
        this.flights.delete(fullKey);
        this.loadGenerations.delete(fullKey);
      } else if (!current) {
        // This flight was discarded and no newer load replaced it, so its
        // bumped generation would otherwise leak for the key.
        this.loadGenerations.delete(fullKey);
      }
    }
  }

  async getMany(keys: string[]): Promise<Map<string, T | null>> {
    const result = new Map<string, T | null>();
    const fullKeys = keys.map((key) => this.makeKey(key));
    const missingIndexes: number[] = [];

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]!;
      const cached = this.getL1(fullKeys[i]!);
      if (cached) {
        result.set(key, cached.value);
        this.recordL1Hit(cached.value);
      } else {
        missingIndexes.push(i);
        result.set(key, null);
      }
    }

    if (missingIndexes.length === 0) return result;

    const redisValues = await this.redis.mget(
      ...missingIndexes.map((index) => fullKeys[index]!),
    );

    for (let i = 0; i < missingIndexes.length; i++) {
      const keyIndex = missingIndexes[i]!;
      const key = keys[keyIndex]!;
      const redisValue = redisValues[i];
      if (redisValue === null || redisValue === undefined) {
        this.metrics?.recordMiss(this.label);
        result.set(key, null);
        continue;
      }
      try {
        const decoded = this.codec.decode(redisValue);
        this.setL1(fullKeys[keyIndex]!, decoded, this.defaultTtlMs);
        result.set(key, decoded);
        this.recordL1Hit(decoded);
      } catch {
        this.metrics?.recordMiss(this.label);
        result.set(key, null);
      }
    }

    return result;
  }

  async set(key: string, value: T, ttlMs: number): Promise<void> {
    const fullKey = this.makeKey(key);
    // An explicit write wins over a load that started earlier.
    this.discardKey(fullKey);
    const encoded = this.codec.encode(value);
    await this.redis.set(fullKey, encoded, "PX", ttlMs);
    this.setL1(fullKey, value, ttlMs);
    this.metrics?.recordWrite(this.label);
  }

  async delete(...keys: string[]): Promise<void> {
    const fullKeys = keys.map((key) => this.makeKey(key));
    for (const fullKey of fullKeys) this.discardKey(fullKey);

    if (fullKeys.length > 0) {
      await this.redis.del(...fullKeys);
      await this.invalidation.invalidate(this.label, fullKeys);
    }

    this.metrics?.recordInvalidation(this.label);
  }
}

export function createCache<T>(options: CacheOptions<T>): Cache<T> {
  return new Cache<T>(options);
}
