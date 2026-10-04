import { describe, it, expect, vi, beforeEach } from "bun:test";
import { CacheService } from "../src/services/cache-service.js";

describe("CacheService", () => {
  let mockRedis: any;
  let mockInvalidation: any;
  let mockLogger: any;
  let store: Map<string, string>;

  beforeEach(() => {
    store = new Map();
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
      exists: vi.fn(async (key: string) => (store.has(key) ? 1 : 0)),
      eval: vi.fn().mockResolvedValue(1),
    };
    mockInvalidation = {
      invalidate: vi.fn(async (...keys: string[]) => {
        for (const k of keys) store.delete(k);
      }),
    };
    mockLogger = {
      warn: vi.fn(),
      error: vi.fn(),
    };
  });

  it("handles basic get, set with TTL, and has operations", async () => {
    const cache = new CacheService({ redis: mockRedis, logger: mockLogger });

    await cache.set("user:123", { name: "Alice" }, 300);
    expect(mockRedis.set).toHaveBeenCalledWith(
      "user:123",
      JSON.stringify({ name: "Alice" }),
      "EX",
      300,
    );

    const hasKey = await cache.has("user:123");
    expect(hasKey).toBe(true);

    const value = await cache.get<{ name: string }>("user:123");
    expect(value).toEqual({ name: "Alice" });
  });

  it("returns null on cache miss or corrupted json without throwing", async () => {
    const cache = new CacheService({ redis: mockRedis, logger: mockLogger });

    const miss = await cache.get("missing");
    expect(miss).toBeNull();

    store.set("bad-json", "{not-valid-json");
    const corrupted = await cache.get("bad-json");
    expect(corrupted).toBeNull();
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it("implements cache-aside getOrSet pattern", async () => {
    const cache = new CacheService({ redis: mockRedis });

    const producer = vi.fn().mockResolvedValue({ role: "admin" });

    // First call: cache miss -> invokes producer and caches result
    const val1 = await cache.getOrSet("user:role:1", 60, producer);
    expect(val1).toEqual({ role: "admin" });
    expect(producer).toHaveBeenCalledTimes(1);

    // Second call: cache hit -> returns from cache without calling producer
    const val2 = await cache.getOrSet("user:role:1", 60, producer);
    expect(val2).toEqual({ role: "admin" });
    expect(producer).toHaveBeenCalledTimes(1);
  });

  it("invalidates through InvalidationBus when provided, otherwise falls back to redis.del", async () => {
    const busCache = new CacheService({
      redis: mockRedis,
      invalidation: mockInvalidation,
    });
    await busCache.del("key1", "key2");
    expect(mockInvalidation.invalidate).toHaveBeenCalledWith("key1", "key2");
    expect(mockRedis.del).not.toHaveBeenCalled();

    const plainCache = new CacheService({ redis: mockRedis });
    await plainCache.del("key3");
    expect(mockRedis.del).toHaveBeenCalledWith("key3");
  });

  it("delegates verifyLock to Redis", async () => {
    const cache = new CacheService({ redis: mockRedis });
    const isOwner = await cache.verifyLock("mutex:job", "token-abc");
    expect(isOwner).toBe(true);
    expect(mockRedis.eval).toHaveBeenCalled();
  });
});
