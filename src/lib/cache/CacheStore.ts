import { delSafe, mgetSafe, type RedisClient } from "@redis/Cluster.js";
import { cacheHits, cacheMisses } from "@observability/Index.ts";
import { container } from "@lib/Services.js";

export interface CacheStoreOptions {
  negativeTtlSeconds?: number;
  redis?: RedisClient;
}

class Flight {
  public discarded = false;
  public promise: Promise<unknown> = Promise.resolve();
}

const DefaultNegativeTtlSeconds = 15;
const NegativePrefix = "neg:";

export class CacheStore {
  readonly #flights = new Map<string, Flight>();
  readonly #negativeTtlSeconds: number;
  readonly #redis: RedisClient | undefined;

  public constructor(options?: CacheStoreOptions) {
    this.#negativeTtlSeconds = options?.negativeTtlSeconds ?? DefaultNegativeTtlSeconds;
    this.#redis = options?.redis;
  }

  public getOrLoad<T>(
    key: string,
    ttlMs: number,
    loader: () => Promise<T | null | undefined>,
    parser: (data: string) => T = JSON.parse,
    serializer: (data: T) => string = JSON.stringify,
  ): Promise<T> {
    const pending = this.#flights.get(key);
    if (pending) return pending.promise as Promise<T>;

    const flight = new Flight();
    flight.promise = this.#load(key, ttlMs, loader, parser, serializer, flight);
    this.#flights.set(key, flight);
    return flight.promise as Promise<T>;
  }

  public delete(key: string): void {
    const flight = this.#flights.get(key);
    if (flight) flight.discarded = true;
    void delSafe(this.#client(), [key, `${NegativePrefix}${key}`]).catch(() => {});
  }

  public clear(): void {
    this.#flights.clear();
  }

  async #load<T>(
    key: string,
    ttlMs: number,
    loader: () => Promise<T | null | undefined>,
    parser: (data: string) => T,
    serializer: (data: T) => string,
    flight: Flight,
  ): Promise<T> {
    const cache = key.split(":")[1] ?? "unknown";
    const negativeKey = `${NegativePrefix}${key}`;

    try {
      const [cached, negative] = await mgetSafe(this.#client(), [key, negativeKey]);
      if (negative) {
        cacheHits.inc({ cache });
        return null as T;
      }
      if (cached) {
        try {
          const value = parser(cached);
          cacheHits.inc({ cache });
          return value;
        } catch {
          // Unparseable Redis entry: treat as a miss.
        }
      }

      cacheMisses.inc({ cache });
      const data = await loader();
      if (flight.discarded) return data as T;

      if (data === null || data === undefined) {
        void this.#client()
          .setex(negativeKey, this.#negativeTtlSeconds, "1")
          .catch(() => {});
        return null as T;
      }

      const serialized = serializer(data);
      void this.#client()
        .setex(key, toTtlSeconds(ttlMs), serialized)
        .catch(() => {});
      return data;
    } finally {
      if (this.#flights.get(key) === flight) this.#flights.delete(key);
    }
  }

  #client(): RedisClient {
    return this.#redis ?? container.redis;
  }
}

function toTtlSeconds(ttlMs: number): number {
  return Math.max(1, Math.ceil(ttlMs / 1000));
}

export const repositoryCache = new CacheStore();
