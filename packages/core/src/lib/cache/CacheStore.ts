import type { InvalidationBus } from "#lib/database/valkey.js";
import type { ValkeyClient } from "@lumi/infrastructure/database";
import { cacheHits, cacheMisses } from "@lumi/observability";
import { container } from "#lib/services.js";

export interface CacheStoreOptions {
  maxEntries?: number;
  negativeTtlMs?: number;
  /**
   * Explicit L2 client. When omitted the process-default `container.valkey`
   * is used.
   */
  valkey?: ValkeyClient;
}

interface L1Entry {
  value: unknown;
  expiresAt: number;
}

const DefaultMaxEntries = 5_000;
const DefaultNegativeTtlMs = 15_000;

/** Whole seconds for SETEX, clamped: sub-second TTLs would send `0` and fail. */
function ttlSeconds(ttlMs: number): number {
  return Math.max(1, Math.ceil(ttlMs / 1000));
}

/**
 * A process-local, bounded L1 cache in front of Valkey (L2), with negative
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
  #valkey: ValkeyClient | undefined;

  public constructor(options?: CacheStoreOptions) {
    this.#maxEntries = options?.maxEntries ?? DefaultMaxEntries;
    this.#negativeTtlMs = options?.negativeTtlMs ?? DefaultNegativeTtlMs;
    this.#valkey = options?.valkey;
  }

  /** Overrides the L2 client (e.g. in tests); preferred over the global. */
  public setValkeyClient(valkey: ValkeyClient): void {
    this.#valkey = valkey;
  }

  #l2(): ValkeyClient {
    return this.#valkey ?? container.valkey;
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
      this.#capAux(this.#negativeUntil);
      this.#negativeUntil.set(key, Date.now() + this.#negativeTtlMs);
      if (!opts?.l1Only) {
        // L1-only negative caching would leave a stale L2 entry for peers
        // (and for this process once the negative window lapses).
        void this.#l2().del(key)?.catch?.(() => {});
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
        const cached = await this.#l2().get(key);
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
        const data = await loader();
        if ((this.#generations.get(key) ?? 0) !== generation) {
          return data as T;
        }

        if (data === null || data === undefined) {
          this.#capAux(this.#negativeUntil);
          this.#negativeUntil.set(key, Date.now() + this.#negativeTtlMs);
        } else {
          this.#writeL1(key, data, ttlMs);
          const serialized = serializer(data);
          if (serialized !== undefined) {
            // Fire-and-forget: the L2 fill must not add a round trip to the
            // read-miss path, nor fail a DB read that already succeeded when
            // Valkey itself is having a bad day.
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

  /**
   * FIFO cap for the unbounded aux maps. L1 is already bounded; without this
   * `#negativeUntil`/`#generations` keep one entry per distinct key ever seen.
   * Evicting from either is fail-safe: a lost negative entry just re-reads,
   * and a lost generation only ever discards (never poisons) an in-flight
   * write, since the lookup falls back to `?? 0` and mismatches on `!==`.
   */
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

/**
 * Process-wide shared cache for repository reads. Lives here (next to the
 * class) rather than in `Repository.js`: that module sits inside the
 * services → DatabaseService → repositories import chain, so instantiating
 * the cache there runs while this module is still initializing (TDZ crash).
 */
export const repositoryCache = new CacheStore();
