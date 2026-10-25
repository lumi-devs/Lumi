import { createCodec, type Codec } from "./codec.js";

export interface CacheOptions<T> {
  redis: any;
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
  getOrLoad(key: string, ttlMs: number, loader: () => Promise<T | null>, options?: { negativeTtlMs?: number }): Promise<T | null>;
  getMany(keys: string[]): Promise<Map<string, T | null>>;
  set(key: string, value: T, ttlMs: number): Promise<void>;
  delete(...keys: string[]): Promise<void>;
  namespace(name: string): NamespacedCache<T>;
}

interface L1Entry<T> {
  value: T;
  expiresAt: number;
}

interface LoadFlight<T> {
  promise: Promise<T | null>;
  discarded: boolean;
}

export class Cache<T = any> implements NamespacedCache<T> {
  private readonly redis: any;
  private readonly invalidation: InvalidationBus;
  private readonly metrics?: CacheMetrics;
  private readonly defaultTtlMs: number;
  private readonly defaultNegativeTtlMs: number;
  private readonly l1MaxSize: number;
  private readonly l1MaxTtlMs: number;
  private readonly codec: Codec<T>;
  private namespacePrefix: string;
  
  private l1 = new Map<string, L1Entry<T>>();
  private flights = new Map<string, LoadFlight<T>>();
  private namespaceListeners = new Map<string, Set<(keys: string[]) => void>>();

  constructor(options: CacheOptions<T>) {
    this.redis = options.redis;
    this.invalidation = options.invalidation;
    this.metrics = options.metrics;
    this.defaultTtlMs = options.defaultTtlMs ?? 60_000;
    this.defaultNegativeTtlMs = options.defaultNegativeTtlMs ?? 15_000;
    this.l1MaxSize = options.l1MaxSize ?? 10_000;
    this.l1MaxTtlMs = options.l1MaxTtlMs ?? 5_000;
    this.codec = createCodec<T>();
    this.namespacePrefix = "";
    
    this.setupInvalidationHandlers();
  }

  private setupInvalidationHandlers(): void {
    this.invalidation.subscribe("", (keys) => {
      for (const key of keys) {
        this.l1.delete(key);
        const flight = this.flights.get(key);
        if (flight) flight.discarded = true;
      }
    });
    
    this.invalidation.onResync().then(() => {
      this.l1.clear();
      this.flights.clear();
    });
  }

  namespace(name: string): NamespacedCache<T> {
    const child = new Cache<T>({
      redis: this.redis,
      invalidation: this.invalidation,
      metrics: this.metrics,
      defaultTtlMs: this.defaultTtlMs,
      defaultNegativeTtlMs: this.defaultNegativeTtlMs,
      l1MaxSize: this.l1MaxSize,
      l1MaxTtlMs: this.l1MaxTtlMs,
    });
    child.namespacePrefix = `${this.namespacePrefix}${name}:`;
    return child as any;
  }

  private makeKey(key: string): string {
    return `${this.namespacePrefix}${key}`;
  }

  private getL1(key: string): T | null {
    const fullKey = this.makeKey(key);
    const entry = this.l1.get(fullKey);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      this.l1.delete(fullKey);
      return null;
    }
    return entry.value;
  }

  private setL1(key: string, value: T, ttlMs: number): void {
    const fullKey = this.makeKey(key);
    if (this.l1.size >= this.l1MaxSize) {
      const firstKey = this.l1.keys().next().value;
      if (firstKey) this.l1.delete(firstKey);
      this.metrics?.recordEviction(this.namespacePrefix.slice(0, -1) || "default");
    }
    this.l1.set(fullKey, { value, expiresAt: Date.now() + Math.min(ttlMs, this.l1MaxTtlMs) });
  }

  async get(key: string): Promise<T | null> {
    const fullKey = this.makeKey(key);
    
    const l1Value = this.getL1(key);
    if (l1Value !== null) {
      this.metrics?.recordHit(this.namespacePrefix.slice(0, -1) || "default");
      return l1Value;
    }

    this.metrics?.recordMiss(this.namespacePrefix.slice(0, -1) || "default");
    
    const redisValue = await this.redis.get(fullKey);
    if (!redisValue) return null;
    
    try {
      const decoded = this.codec.decode(redisValue);
      this.setL1(key, decoded, this.defaultTtlMs);
      return decoded;
    } catch {
      return null;
    }
  }

  async getOrLoad(
    key: string,
    ttlMs: number,
    loader: () => Promise<T | null>,
    options?: { negativeTtlMs?: number }
  ): Promise<T | null> {
    const fullKey = this.makeKey(key);
    
    const l1Value = this.getL1(key);
    if (l1Value !== null) {
      this.metrics?.recordHit(this.namespacePrefix.slice(0, -1) || "default");
      return l1Value;
    }

    const existingFlight = this.flights.get(fullKey);
    if (existingFlight) {
      return existingFlight.promise;
    }

    this.metrics?.recordMiss(this.namespacePrefix.slice(0, -1) || "default");
    
    const flightPromise = (async () => {
      const startTime = Date.now();
      try {
        const value = await loader();
        const negativeTtlMs = options?.negativeTtlMs ?? this.defaultNegativeTtlMs;
        
        if (value === null) {
          await this.redis.set(fullKey, this.codec.encodeNull(), "PX", negativeTtlMs);
          this.setL1(key, null as any, negativeTtlMs);
          this.metrics?.recordNegativeHit(this.namespacePrefix.slice(0, -1) || "default");
        } else {
          const encoded = this.codec.encode(value);
          await this.redis.set(fullKey, encoded, "PX", ttlMs);
          this.setL1(key, value, ttlMs);
          this.metrics?.recordWrite(this.namespacePrefix.slice(0, -1) || "default");
        }
        
        this.metrics?.recordFillDuration(this.namespacePrefix.slice(0, -1) || "default", Date.now() - startTime);
        return value;
      } catch (error) {
        const flight = this.flights.get(fullKey);
        if (flight) flight.discarded = true;
        throw error;
      } finally {
        this.flights.delete(fullKey);
      }
    })();

    this.flights.set(fullKey, { promise: flightPromise, discarded: false });
    
    try {
      return await flightPromise;
    } catch (error) {
      throw error;
    }
  }

  async getMany(keys: string[]): Promise<Map<string, T | null>> {
    const result = new Map<string, T | null>();
    const missingKeys: string[] = [];
    const fullKeys = keys.map(k => this.makeKey(k));
    
    for (let i = 0; i < keys.length; i++) {
      const l1Value = this.getL1(keys[i]);
      if (l1Value !== null) {
        result.set(keys[i], l1Value);
        this.metrics?.recordHit(this.namespacePrefix.slice(0, -1) || "default");
      } else {
        missingKeys.push(fullKeys[i]);
        result.set(keys[i], null);
      }
    }

    if (missingKeys.length === 0) return result;

    const redisValues = await this.redis.mget(...missingKeys);
    
    for (let i = 0; i < missingKeys.length; i++) {
      const value = redisValues[i];
      const originalKey = keys[fullKeys.indexOf(missingKeys[i])];
      
      if (!value) {
        this.metrics?.recordMiss(this.namespacePrefix.slice(0, -1) || "default");
        result.set(originalKey, null);
        continue;
      }
      
      try {
        const decoded = this.codec.decode(value);
        this.setL1(originalKey, decoded, this.defaultTtlMs);
        result.set(originalKey, decoded);
        this.metrics?.recordHit(this.namespacePrefix.slice(0, -1) || "default");
      } catch {
        result.set(originalKey, null);
      }
    }

    return result;
  }

  async set(key: string, value: T, ttlMs: number): Promise<void> {
    const fullKey = this.makeKey(key);
    const encoded = this.codec.encode(value);
    await this.redis.set(fullKey, encoded, "PX", ttlMs);
    this.setL1(key, value, ttlMs);
    this.metrics?.recordWrite(this.namespacePrefix.slice(0, -1) || "default");
  }

  async delete(...keys: string[]): Promise<void> {
    const fullKeys = keys.map(k => this.makeKey(k));
    
    for (const key of keys) {
      this.l1.delete(this.makeKey(key));
    }
    
    if (fullKeys.length > 0) {
      await this.redis.del(...fullKeys);
      await this.invalidation.invalidate(this.namespacePrefix.slice(0, -1) || "default", fullKeys);
    }
    
    this.metrics?.recordInvalidation(this.namespacePrefix.slice(0, -1) || "default");
  }
}

export function createCache<T>(options: CacheOptions<T>): Cache<T> {
  return new Cache<T>(options);
}