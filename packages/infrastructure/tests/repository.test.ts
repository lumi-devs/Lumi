import { describe, it, expect, vi, beforeEach } from "bun:test";
import { BaseRepository } from "../src/database/repository.js";

class TestRepository extends BaseRepository {
  public constructor(
    db: any,
    valkey?: any,
    invalidation?: any,
    logger?: any,
  ) {
    super(db, valkey, invalidation, logger);
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
  let mockValkey: any;
  let mockInvalidation: any;
  let mockLogger: any;
  let store: Map<string, string>;

  beforeEach(() => {
    store = new Map();
    mockDb = {};
    mockValkey = {
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

  it("fetches directly from source when valkey is unavailable", async () => {
    const repo = new TestRepository(mockDb);
    const fetcher = vi.fn().mockResolvedValue({ id: "1" });

    const result = await repo.getCachedValue("item:1", 60, fetcher);
    expect(result).toEqual({ id: "1" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("caches and serves subsequent calls from valkey", async () => {
    const repo = new TestRepository(mockDb, mockValkey, mockInvalidation, mockLogger);
    const fetcher = vi.fn().mockResolvedValue({ counter: 42 });

    const first = await repo.getCachedValue("counter:key", 60, fetcher);
    expect(first).toEqual({ counter: 42 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(mockValkey.set).toHaveBeenCalledWith("counter:key", JSON.stringify({ counter: 42 }), "EX", 60);

    const second = await repo.getCachedValue("counter:key", 60, fetcher);
    expect(second).toEqual({ counter: 42 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("handles valkey read/write errors gracefully by falling back to fetcher", async () => {
    mockValkey.get.mockRejectedValueOnce(new Error("Valkey read timeout"));
    mockValkey.set.mockRejectedValueOnce(new Error("Valkey write timeout"));

    const repo = new TestRepository(mockDb, mockValkey, mockInvalidation, mockLogger);
    const fetcher = vi.fn().mockResolvedValue({ fallback: true });

    const result = await repo.getCachedValue("err:key", 60, fetcher);
    expect(result).toEqual({ fallback: true });
    expect(mockLogger.warn).toHaveBeenCalledTimes(2);
  });

  it("invalidates keys via invalidation bus or valkey", async () => {
    const repoWithBus = new TestRepository(mockDb, mockValkey, mockInvalidation);
    await repoWithBus.invalidate("k1", "k2");
    expect(mockInvalidation.invalidate).toHaveBeenCalledWith("k1", "k2");

    const repoWithoutBus = new TestRepository(mockDb, mockValkey);
    await repoWithoutBus.invalidate("k3");
    expect(mockValkey.del).toHaveBeenCalledWith("k3");
  });
});
