import { CacheStore } from "#lib/cache/CacheStore.js";
import { InvalidationBus } from "#lib/database/redis.js";
import { container } from "@sapphire/framework";
import { describe, expect, test, vi, beforeEach } from "bun:test";

vi.mock("@lumi/observability", () => ({
  cacheHits: { inc: vi.fn() },
  cacheMisses: { inc: vi.fn() },
}));

describe("CacheStore", () => {
  let mockRedis: any;

  beforeEach(() => {
    mockRedis = {
      get: vi.fn().mockResolvedValue(null),
      setex: vi.fn().mockResolvedValue("OK"),
    };
    (container as any).redis = mockRedis;
  });

  test("L1 hit avoids a second redis.get call", async () => {
    const cache = new CacheStore();
    const loader = vi.fn().mockResolvedValue({ n: 1 });

    const first = await cache.getOrLoad("prefix:key:1", 60_000, loader);
    expect(first).toEqual({ n: 1 });
    expect(mockRedis.get).toHaveBeenCalledTimes(1);

    const second = await cache.getOrLoad("prefix:key:1", 60_000, loader);
    expect(second).toEqual({ n: 1 });
    expect(mockRedis.get).toHaveBeenCalledTimes(1);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  test("a confirmed-null loader result negatively caches", async () => {
    const cache = new CacheStore({ negativeTtlMs: 60_000 });
    const loader = vi.fn().mockResolvedValue(null);

    const first = await cache.getOrLoad("prefix:missing:1", 60_000, loader);
    expect(first).toBeNull();
    expect(loader).toHaveBeenCalledTimes(1);

    const second = await cache.getOrLoad("prefix:missing:1", 60_000, loader);
    expect(second).toBeNull();
    expect(loader).toHaveBeenCalledTimes(1);
  });

  test("concurrent getOrLoad calls for the same key share one in-flight promise", async () => {
    const cache = new CacheStore();
    let resolveLoader!: (v: { n: number }) => void;
    const loader = vi.fn().mockReturnValue(
      new Promise<{ n: number }>((resolve) => {
        resolveLoader = resolve;
      }),
    );

    const first = cache.getOrLoad("prefix:concurrent:1", 60_000, loader);
    const second = cache.getOrLoad("prefix:concurrent:1", 60_000, loader);
    resolveLoader({ n: 42 });

    await expect(first).resolves.toEqual({ n: 42 });
    await expect(second).resolves.toEqual({ n: 42 });
    expect(loader).toHaveBeenCalledTimes(1);
  });

  test("the generation check: a delete during a pending load discards the write", async () => {
    const cache = new CacheStore();
    let resolveLoader!: (v: { n: number }) => void;
    const loader = vi.fn().mockReturnValue(
      new Promise<{ n: number }>((resolve) => {
        resolveLoader = resolve;
      }),
    );

    const flight = cache.getOrLoad("prefix:race:1", 60_000, loader);
    cache.delete("prefix:race:1");
    resolveLoader({ n: 7 });

    const result = await flight;
    expect(result).toEqual({ n: 7 });
    expect(cache.peek("prefix:race:1")).toBeUndefined();
    expect(mockRedis.setex).not.toHaveBeenCalledWith(
      "prefix:race:1",
      expect.anything(),
      expect.stringContaining("7"),
    );
  });

  test("maxEntries eviction: filling past the cap evicts the oldest key (FIFO)", async () => {
    const cache = new CacheStore({ maxEntries: 2 });

    await cache.getOrLoad("prefix:a:1", 60_000, async () => "a");
    await cache.getOrLoad("prefix:b:1", 60_000, async () => "b");
    await cache.getOrLoad("prefix:c:1", 60_000, async () => "c");

    expect(cache.peek<string>("prefix:a:1")).toBeUndefined();
    expect(cache.peek<string>("prefix:b:1")).toBe("b");
    expect(cache.peek<string>("prefix:c:1")).toBe("c");
  });

  test("attachToInvalidationBus: onInvalidate evicts one key, onResync clears everything", async () => {
    const fakeSubscriber = {
      on: vi.fn((event: string, fn: any) => {
        (fakeSubscriber as any)[`_${event}`] = fn;
      }),
      subscribe: vi.fn().mockResolvedValue(undefined),
      unsubscribe: vi.fn().mockResolvedValue(undefined),
      quit: vi.fn().mockResolvedValue("OK"),
    };

    const bus = new InvalidationBus(fakeSubscriber as any);
    const cache = new CacheStore();

    await cache.getOrLoad("prefix:x:1", 60_000, async () => "x");
    await cache.getOrLoad("prefix:y:1", 60_000, async () => "y");

    cache.attachToInvalidationBus(bus);
    await bus.start();

    const messageListener = (fakeSubscriber as any)._message;
    messageListener(
      "lumi:cache:invalidate",
      JSON.stringify({ keys: ["prefix:x:1"] }),
    );

    expect(cache.peek<string>("prefix:x:1")).toBeUndefined();
    expect(cache.peek<string>("prefix:y:1")).toBe("y");

    (fakeSubscriber as any)._close();
    (fakeSubscriber as any)._ready();

    expect(cache.peek<string>("prefix:y:1")).toBeUndefined();
  });
});
