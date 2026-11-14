import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Cache } from "../src/cache.js";

const createMockRedis = () => ({
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  mget: vi.fn(),
  pipeline: vi.fn(() => ({
    get: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    del: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([]),
  })),
});

const createMockInvalidationBus = () => {
  const listeners = new Map<string, Set<(keys: string[]) => void>>();

  return {
    subscribe: vi.fn(
      (namespace: string, listener: (keys: string[]) => void) => {
        if (!listeners.has(namespace)) listeners.set(namespace, new Set());
        listeners.get(namespace)!.add(listener);
        return () => listeners.get(namespace)!.delete(listener);
      },
    ),
    invalidate: vi.fn(async (namespace: string, keys: string[]) => {
      const ls = listeners.get(namespace) || listeners.get("");
      ls?.forEach((fn) => {
        fn(keys);
      });
    }),
    onResync: vi.fn().mockResolvedValue(undefined),
  };
};

describe("Cache", () => {
  let cache: Cache<any>;
  let mockRedis: ReturnType<typeof createMockRedis>;
  let mockInvalidation: ReturnType<typeof createMockInvalidationBus>;

  beforeEach(() => {
    mockRedis = createMockRedis();
    mockInvalidation = createMockInvalidationBus();

    mockRedis.get.mockResolvedValue(null);
    mockRedis.set.mockResolvedValue("OK");
    mockRedis.del.mockResolvedValue(1);
    mockRedis.mget.mockResolvedValue([null, null]);

    cache = new Cache({
      redis: mockRedis,
      invalidation: mockInvalidation,
      defaultTtlMs: 60_000,
      defaultNegativeTtlMs: 15_000,
      l1MaxSize: 100,
    });
  });

  afterEach(() => {
    (cache as any).l1.clear();
    (cache as any).flights.clear();
  });

  it("should construct without errors", () => {
    expect(cache).toBeInstanceOf(Cache);
  });

  it("should create namespaced cache", async () => {
    const nsCache = cache.namespace("sub");
    await nsCache.set("key1", { value: "namespaced" }, 60_000);
    expect(mockRedis.set).toHaveBeenCalled();
  });

  it("should call Redis set with PX and TTL", async () => {
    await cache.set("key1", { value: "hello" }, 60_000);
    expect(mockRedis.set).toHaveBeenCalled();
    const call = mockRedis.set.mock.calls[0];
    expect(call[2]).toBe("PX");
    expect(call[3]).toBeDefined();
  });

  it("should call Redis del on delete", async () => {
    await cache.set("key1", { value: "hello" }, 60_000);
    await cache.delete("key1");
    expect(mockRedis.del).toHaveBeenCalled();
  });

  it("should handle Date objects in values", async () => {
    const date = new Date("2024-01-15T12:00:00Z");
    await cache.set("key1", { date }, 60_000);
    expect(mockRedis.set).toHaveBeenCalled();
  });

  it("should handle BigInt objects in values", async () => {
    const bigint = 12345678901234567890n;
    await cache.set("key1", { bigint }, 60_000);
    expect(mockRedis.set).toHaveBeenCalled();
  });
});
