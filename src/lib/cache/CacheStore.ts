import type { InvalidationBus } from "#src/lib/valkey/Store.js";
import type {ValkeyClient} from "#src/lib/valkey/Cluster.js";
import { cacheHits, cacheMisses } from "#src/observability/Index.ts";
import { withTimeout } from "#src/lib/utilities/Resilience.js";
import { container } from "#src/lib/Services.js";

export interface CacheStoreOptions {
  maxEntries?: number;
  negativeTtlMs?: number;

  valkey?: ValkeyClient;
}

interface L1Entry {
  value: unknown;
  expiresAt: number;
}

const DefaultMaxEntries = 5_000;
const DefaultNegativeTtlMs = 15_000;

function ttlSeconds(ttlMs: number): number {
  return Math.max(1, Math.ceil(ttlMs / 1000));
}

export class CacheStore {
  readonly #l1 = new Map<string, L1Entry>();
  readonly #negativeUntil = new Map<string, number>();
  readonly #inflight = new Map<string, Promise<unknown>>();
  readonly #generations = new Map<string, number>();
  readonly #maxEntries: number;
  readonly #negativeTtlMs: number;
  #valkey: ValkeyClient | undefined;

  public constructor(options?: CacheStoreOptions) {
    this.#maxEntries = options?.maxEntries ?? DefaultMaxEntries;
    this.#negativeTtlMs = options?.negativeTtlMs ?? DefaultNegativeTtlMs;
    this.#valkey = options?.valkey;
  }

  public setValkeyClient(valkey: ValkeyClient): void {
    this.#valkey = valkey;
  }

  #l2(): ValkeyClient {
    return this.#valkey ?? container.valkey;
  }

  #publishInvalidate(key: string): void {
    try {
      void container.invalidation?.invalidate(key)?.catch?.(() => {});
    } catch {}
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
      this.#rememberNegative(key);
      if (!opts?.l1Only) {
        void this.#l2().del(key)?.catch?.(() => {});
        this.#publishInvalidate(key);
      }
      return;
    }

    this.#negativeUntil.delete(key);
    this.#writeL1(key, value, ttlMs);
    if (!opts?.l1Only) {
      void this.#l2()
        .setex(key, ttlSeconds(ttlMs), JSON.stringify(value))
        ?.catch?.(() => {});
    }
  }

  public delete(key: string, opts?: { publish?: boolean }): void {
    this.#bumpGeneration(key);
    this.#l1.delete(key);
    this.#negativeUntil.delete(key);
    if (opts?.publish === false) return;
    void this.#l2().del(key)?.catch?.(() => {});
    this.#publishInvalidate(key);
  }

  public clear(): void {
    this.#l1.clear();
    this.#negativeUntil.clear();
    this.#inflight.clear();
    this.#generations.clear();
  }

  public attachToInvalidationBus(bus: InvalidationBus): () => void {
    const unbindInvalidate = bus.onInvalidate((keys) => {
      for (const key of keys) this.delete(key, { publish: false });
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

    const generation = this.#generations.get(key) ?? 0;

    const flight = (async (): Promise<T> => {
      try {
        const cached = await withTimeout(() => this.#l2().get(key), 5000);
        if (cached) {
          try {
            const value = parser(cached);
            if ((this.#generations.get(key) ?? 0) === generation) {
              this.#writeL1(key, value, ttlMs);
            }
            cacheHits.inc({ cache });
            return value;
          } catch {
            // Unparseable Valkey entry: fall through and treat as a miss.
          }
        }

        cacheMisses.inc({ cache });
        const data = await withTimeout(() => loader(), 10000);
        if ((this.#generations.get(key) ?? 0) !== generation) {
          return data as T;
        }

        if (data === null || data === undefined) {
          this.#rememberNegative(key);
        } else {
          this.#writeL1(key, data, ttlMs);
          const serialized = serializer(data);
          if (serialized !== undefined) {

            void this.#l2().setex(key, ttlSeconds(ttlMs), serialized)?.catch?.(() => {});
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
    this.#capAux(this.#generations);
    this.#generations.set(key, (this.#generations.get(key) ?? 0) + 1);
  }

  #rememberNegative(key: string): void {
    this.#capAux(this.#negativeUntil);
    this.#negativeUntil.set(key, Date.now() + this.#negativeTtlMs);
  }

  #capAux(map: Map<string, number>): void {
    if (map.size >= this.#maxEntries) {
      const oldestKey = map.keys().next().value;
      if (oldestKey !== undefined) map.delete(oldestKey);
    }
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

export const repositoryCache = new CacheStore();
