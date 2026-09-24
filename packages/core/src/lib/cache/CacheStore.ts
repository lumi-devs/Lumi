import type { InvalidationBus } from "#lib/database/redis.js";
import { cacheHits, cacheMisses } from "@lumi/observability";
import { container } from "@sapphire/framework";

export interface CacheStoreOptions {
  maxEntries?: number;
  negativeTtlMs?: number;
}

interface L1Entry {
  value: unknown;
  expiresAt: number;
}

const DefaultMaxEntries = 5_000;
const DefaultNegativeTtlMs = 15_000;

/**
 * A process-local, bounded L1 cache in front of Redis (L2), with negative
 * caching for confirmed-absent values and a generation check that discards
 * (without caching) any load that resolves after the key was invalidated or
 * overwritten while that load was in flight.
 */
export class CacheStore {
  readonly #l1 = new Map<string, L1Entry>();
  readonly #negativeUntil = new Map<string, number>();
  readonly #inflight = new Map<string, Promise<unknown>>();
  readonly #generations = new Map<string, number>();
  readonly #maxEntries: number;
  readonly #negativeTtlMs: number;

  public constructor(options?: CacheStoreOptions) {
    this.#maxEntries = options?.maxEntries ?? DefaultMaxEntries;
    this.#negativeTtlMs = options?.negativeTtlMs ?? DefaultNegativeTtlMs;
  }

  public peek<T>(key: string): T | null | undefined {
    const negUntil = this.#negativeUntil.get(key);
    if (negUntil !== undefined) {
      if (negUntil > Date.now()) return null;
      this.#negativeUntil.delete(key);
    }

    const entry = this.#l1.get(key);
    if (!entry) return undefined;
    if (Date.now() >= entry.expiresAt) {
      this.#l1.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  public set<T>(
    key: string,
    value: T | null,
    ttlMs: number,
    opts?: { l1Only?: boolean },
  ): void {
    this.#bumpGeneration(key);

    if (value === null || value === undefined) {
      this.#l1.delete(key);
      this.#negativeUntil.set(key, Date.now() + this.#negativeTtlMs);
      return;
    }

    this.#negativeUntil.delete(key);
    this.#writeL1(key, value, ttlMs);
    if (!opts?.l1Only) {
      container.redis
        .setex(key, Math.ceil(ttlMs / 1000), JSON.stringify(value))
        .catch(() => {});
    }
  }

  public delete(key: string): void {
    this.#bumpGeneration(key);
    this.#l1.delete(key);
    this.#negativeUntil.delete(key);
  }

  public clear(): void {
    this.#l1.clear();
    this.#negativeUntil.clear();
    this.#inflight.clear();
    this.#generations.clear();
  }

  public attachToInvalidationBus(bus: InvalidationBus): () => void {
    const unbindInvalidate = bus.onInvalidate((keys) => {
      for (const key of keys) this.delete(key);
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

  public async getOrLoad<T>(
    key: string,
    ttlMs: number,
    loader: () => Promise<T | null | undefined>,
    parser: (data: string) => T = JSON.parse,
    serializer: (data: T) => string = JSON.stringify,
  ): Promise<T> {
    const cache = key.split(":")[1] ?? "unknown";

    const peeked = this.peek<T>(key);
    if (peeked !== undefined) {
      cacheHits.inc({ cache });
      return peeked as T;
    }

    const pending = this.#inflight.get(key);
    if (pending) return pending as Promise<T>;

    // Captured before the flight starts: if `delete`/`set` bumps this key's
    // generation while the flight is in progress, the value it resolves is
    // stale relative to that change, so it's handed back to the caller but
    // never written to L1 or L2.
    const generation = this.#generations.get(key) ?? 0;

    const flight = (async (): Promise<T> => {
      try {
        const cached = await container.redis.get(key);
        if (cached) {
          try {
            const value = parser(cached);
            if ((this.#generations.get(key) ?? 0) === generation) {
              this.#writeL1(key, value, ttlMs);
            }
            cacheHits.inc({ cache });
            return value;
          } catch {
            // Unparseable Redis entry: fall through and treat as a miss.
          }
        }

        cacheMisses.inc({ cache });
        const data = await loader();
        if ((this.#generations.get(key) ?? 0) !== generation) {
          return data as T;
        }

        if (data === null || data === undefined) {
          this.#negativeUntil.set(key, Date.now() + this.#negativeTtlMs);
        } else {
          this.#writeL1(key, data, ttlMs);
          const serialized = serializer(data);
          if (serialized !== undefined) {
            await container.redis.setex(key, Math.ceil(ttlMs / 1000), serialized);
          }
        }
        return data as T;
      } finally {
        this.#inflight.delete(key);
      }
    })();

    this.#inflight.set(key, flight);
    return flight;
  }

  #bumpGeneration(key: string): void {
    this.#generations.set(key, (this.#generations.get(key) ?? 0) + 1);
  }

  #writeL1<T>(key: string, value: T, ttlMs: number): void {
    if (this.#l1.has(key)) {
      this.#l1.delete(key);
    } else if (this.#l1.size >= this.#maxEntries) {
      const oldestKey = this.#l1.keys().next().value;
      if (oldestKey !== undefined) this.#l1.delete(oldestKey);
    }
    this.#l1.set(key, { value, expiresAt: Date.now() + ttlMs });
  }
}
