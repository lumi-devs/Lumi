import { CacheStore } from "@cache/CacheStore.js";
import { container } from "@lib/Services.js";
import { createMemoryRedis, type MemoryRedis } from "../../mocks/MemoryRedis.js";
import { describe, expect, test, vi, beforeEach } from "bun:test";

vi.mock("@observability/Index.ts", () => ({
  cacheHits: { inc: vi.fn() },
  cacheMisses: { inc: vi.fn() },
}));

describe("CacheStore", () => {
  let redis: MemoryRedis;

  beforeEach(() => {
    redis = createMemoryRedis();
    (container as any).redis = redis;
    (container as any).invalidation = { invalidate: vi.fn().mockResolvedValue(undefined) };
  });

  test("returns a Redis hit without invoking the loader", async () => {
    redis.mget.mockResolvedValue([JSON.stringify({ n: 1 }), null]);
    const loader = vi.fn().mockResolvedValue({ n: 2 });

    const value = await new CacheStore().getOrLoad("prefix:key:1", 60_000, loader);

    expect(value).toEqual({ n: 1 });
    expect(loader).not.toHaveBeenCalled();
    expect(redis.setex).not.toHaveBeenCalled();
  });

  test("loads on a miss and writes the value with a TTL in seconds", async () => {
    const loader = vi.fn().mockResolvedValue({ n: 2 });

    const value = await new CacheStore().getOrLoad("prefix:key:1", 60_000, loader);

    expect(value).toEqual({ n: 2 });
    expect(redis.setex).toHaveBeenCalledWith("prefix:key:1", 60, JSON.stringify({ n: 2 }));
  });

  test("clamps sub-second TTLs to one second", async () => {
    await new CacheStore().getOrLoad("prefix:subsecond:1", 500, async () => "v");

    expect(redis.setex).toHaveBeenCalledWith("prefix:subsecond:1", 1, JSON.stringify("v"));
  });

  test("negatively caches a null loader result under a separate key", async () => {
    const cache = new CacheStore({ negativeTtlSeconds: 60 });
    const loader = vi.fn().mockResolvedValue(null);

    const first = await cache.getOrLoad("prefix:missing:1", 60_000, loader);
    expect(first).toBeNull();
    expect(redis.setex).toHaveBeenCalledWith("neg:prefix:missing:1", 60, "1");

    redis.mget.mockResolvedValue([null, "1"]);
    const second = await cache.getOrLoad("prefix:missing:1", 60_000, loader);

    expect(second).toBeNull();
    expect(loader).toHaveBeenCalledTimes(1);
  });

  test("shares one in-flight promise for concurrent misses", async () => {
    let resolveLoader!: (value: { n: number }) => void;
    const loader = vi.fn().mockReturnValue(
      new Promise<{ n: number }>((resolve) => {
        resolveLoader = resolve;
      }),
    );
    const cache = new CacheStore();

    const first = cache.getOrLoad("prefix:concurrent:1", 60_000, loader);
    const second = cache.getOrLoad("prefix:concurrent:1", 60_000, loader);
    resolveLoader({ n: 42 });

    await expect(first).resolves.toEqual({ n: 42 });
    await expect(second).resolves.toEqual({ n: 42 });
    expect(loader).toHaveBeenCalledTimes(1);
  });

  test("a delete during a pending load discards the write", async () => {
    let resolveLoader!: (value: { n: number }) => void;
    const loader = vi.fn().mockReturnValue(
      new Promise<{ n: number }>((resolve) => {
        resolveLoader = resolve;
      }),
    );
    const cache = new CacheStore();

    const flight = cache.getOrLoad("prefix:race:1", 60_000, loader);
    cache.delete("prefix:race:1");
    resolveLoader({ n: 7 });

    await expect(flight).resolves.toEqual({ n: 7 });
    expect(redis.setex).not.toHaveBeenCalled();
  });

  test("delete removes the entry and its negative marker", () => {
    new CacheStore().delete("prefix:stale:1");

    expect(redis.del).toHaveBeenCalledWith("prefix:stale:1", "neg:prefix:stale:1");
  });

  test("clear drops in-flight flights so the next call reloads", async () => {
    const cache = new CacheStore();
    const loader = vi.fn().mockResolvedValue("v");
    void cache.getOrLoad("prefix:clear:1", 60_000, loader);
    cache.clear();

    await cache.getOrLoad("prefix:clear:1", 60_000, loader);

    expect(loader).toHaveBeenCalledTimes(2);
  });

  test("uses an injected Redis client instead of the container client", async () => {
    const injected = {
      mget: vi.fn().mockResolvedValue([null, null]),
      setex: vi.fn().mockResolvedValue("OK"),
      del: vi.fn(),
    };
    const cache = new CacheStore({ redis: injected as any });

    await cache.getOrLoad("prefix:injected:1", 60_000, async () => "v");

    expect(injected.mget).toHaveBeenCalledWith("prefix:injected:1", "neg:prefix:injected:1");
    expect(injected.setex).toHaveBeenCalledTimes(1);
    expect(redis.mget).not.toHaveBeenCalled();
  });

  test("a hung write does not block or fail the read", async () => {
    redis.setex.mockReturnValue(new Promise(() => {}));

    const value = await new CacheStore().getOrLoad("prefix:slow:1", 60_000, async () => "v");

    expect(value).toBe("v");
  });
});
