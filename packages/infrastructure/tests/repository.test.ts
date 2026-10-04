import { describe, it, expect, vi, beforeEach } from "bun:test";
import { BaseRepository } from "../src/database/repository.js";

class TestRepository extends BaseRepository {
  public constructor(
    db: any,
    redis?: any,
    invalidation?: any,
    logger?: any,
  ) {
    super(db, redis, invalidation, logger);
  }

  public async getCachedValue<T>(key: string, ttl: number, fetcher: () => Promise<T>): Promise<T> {
    return this.getOrSetCache(key, ttl, fetcher);
  }

  public async invalidate(...keys: string[]): Promise<void> {
    return this.invalidateCache(...keys);
  }
}

describe("BaseRepository", () => {
  let mockDb: any;
  let mockRedis: any;
  let mockInvalidation: any;
  let mockLogger: any;
  let store: Map<string, string>;

  beforeEach(() => {
    store = new Map();
    mockDb = {};
    mockRedis = {
      get: vi.fn(async (key: string) => store.get(key) ?? null),
      set: vi.fn(async (key: string, val: string) => {
        store.set(key, val);
        return "OK";
      }),
      del: vi.fn(async (...keys: string[]) => {
        for (const k of keys) store.delete(k);
        return keys.length;
      }),
    };
    mockInvalidation = {
      invalidate: vi.fn(async (...keys: string[]) => {
        for (const k of keys) store.delete(k);
      }),
    };
    mockLogger = {
      warn: vi.fn(),
    };
  });

  it("fetches directly from source when redis is unavailable", async () => {
    const repo = new TestRepository(mockDb);
    const fetcher = vi.fn().mockResolvedValue({ id: "1" });

    const result = await repo.getCachedValue("item:1", 60, fetcher);
    expect(result).toEqual({ id: "1" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("caches and serves subsequent calls from redis", async () => {
    const repo = new TestRepository(mockDb, mockRedis, mockInvalidation, mockLogger);
    const fetcher = vi.fn().mockResolvedValue({ counter: 42 });

    const first = await repo.getCachedValue("counter:key", 60, fetcher);
    expect(first).toEqual({ counter: 42 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(mockRedis.set).toHaveBeenCalledWith("counter:key", JSON.stringify({ counter: 42 }), "EX", 60);

    const second = await repo.getCachedValue("counter:key", 60, fetcher);
    expect(second).toEqual({ counter: 42 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("handles redis read/write errors gracefully by falling back to fetcher", async () => {
    mockRedis.get.mockRejectedValueOnce(new Error("Redis read timeout"));
    mockRedis.set.mockRejectedValueOnce(new Error("Redis write timeout"));

    const repo = new TestRepository(mockDb, mockRedis, mockInvalidation, mockLogger);
    const fetcher = vi.fn().mockResolvedValue({ fallback: true });

    const result = await repo.getCachedValue("err:key", 60, fetcher);
    expect(result).toEqual({ fallback: true });
    expect(mockLogger.warn).toHaveBeenCalledTimes(2);
  });

  it("invalidates keys via invalidation bus or redis", async () => {
    const repoWithBus = new TestRepository(mockDb, mockRedis, mockInvalidation);
    await repoWithBus.invalidate("k1", "k2");
    expect(mockInvalidation.invalidate).toHaveBeenCalledWith("k1", "k2");

    const repoWithoutBus = new TestRepository(mockDb, mockRedis);
    await repoWithoutBus.invalidate("k3");
    expect(mockRedis.del).toHaveBeenCalledWith("k3");
  });
});
