import { CacheStore } from "@lumi/lib/cache/cache-store.js";
import { InvalidationBus } from "@lumi/lib/valkey/buses.js";
import { container } from "@lumi/lib/services.js";
import { describe, expect, test, vi, beforeEach } from "bun:test";

vi.mock("@lumi/observability", () => ({
  cacheHits: { inc: vi.fn() },
  cacheMisses: { inc: vi.fn() },
}));

describe("CacheStore", () => {
  let mockValkey: any;

  beforeEach(() => {
    mockValkey = {
      get: vi.fn().mockResolvedValue(null),
      setex: vi.fn().mockResolvedValue("OK"),
      del: vi.fn().mockResolvedValue(1),
    };
    (container as any).valkey = mockValkey;
  });

  test("L1 hit avoids a second valkey.get call", async () => {
    const cache = new CacheStore();
    const loader = vi.fn().mockResolvedValue({ n: 1 });

    const first = await cache.getOrLoad("prefix:key:1", 60_000, loader);
    expect(first).toEqual({ n: 1 });
    expect(mockValkey.get).toHaveBeenCalledTimes(1);

    const second = await cache.getOrLoad("prefix:key:1", 60_000, loader);
    expect(second).toEqual({ n: 1 });
    expect(mockValkey.get).toHaveBeenCalledTimes(1);
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
    expect(mockValkey.setex).not.toHaveBeenCalledWith(
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

  test("an explicitly injected valkey client is used instead of the global", async () => {
    const injected = {
      get: vi.fn().mockResolvedValue(null),
      setex: vi.fn().mockResolvedValue("OK"),
    };
    const cache = new CacheStore({ valkey: injected as any });

    await cache.getOrLoad("prefix:injected:1", 60_000, async () => "v");

    expect(injected.get).toHaveBeenCalledTimes(1);
    expect(injected.setex).toHaveBeenCalledTimes(1);
    expect(mockValkey.get).not.toHaveBeenCalled();
  });

  test("setValkeyClient overrides the L2 client after construction", async () => {
    const injected = {
      get: vi.fn().mockResolvedValue(null),
      setex: vi.fn().mockResolvedValue("OK"),
    };
    const cache = new CacheStore();
    cache.setValkeyClient(injected as any);

    await cache.getOrLoad("prefix:override:1", 60_000, async () => "v");

    expect(injected.get).toHaveBeenCalledTimes(1);
    expect(mockValkey.get).not.toHaveBeenCalled();
  });

  test("set with null also deletes the L2 entry so peers never read it stale", () => {
    const cache = new CacheStore();

    cache.set("prefix:stale:1", null, 60_000);

    expect(mockValkey.del).toHaveBeenCalledWith("prefix:stale:1");
    expect(cache.peek("prefix:stale:1")).toBeNull();
  });

  test("sub-second TTLs clamp to 1s instead of sending SETEX 0", async () => {
    const cache = new CacheStore();

    await cache.getOrLoad("prefix:subsecond:1", 500, async () => "v");

    expect(mockValkey.setex).toHaveBeenCalledWith(
      "prefix:subsecond:1",
      1,
      expect.anything(),
    );
  });

  test("a hung L2 fill does not block or fail the read-miss path", async () => {
    mockValkey.setex.mockReturnValue(new Promise(() => {}));
    const cache = new CacheStore();

    const result = await cache.getOrLoad("prefix:slow-l2:1", 60_000, async () => "v");

    expect(result).toBe("v");
    expect(cache.peek<string>("prefix:slow-l2:1")).toBe("v");
  });

  test("negative entries are capped at maxEntries instead of growing forever", async () => {
    const cache = new CacheStore({ maxEntries: 2 });
    const loader = vi.fn().mockResolvedValue(null);

    await cache.getOrLoad("prefix:n:a", 60_000, loader);
    await cache.getOrLoad("prefix:n:b", 60_000, loader);
    await cache.getOrLoad("prefix:n:c", 60_000, loader);
    // "a" was FIFO-evicted from the negative map, so it reloads.
    await cache.getOrLoad("prefix:n:a", 60_000, loader);

    expect(loader).toHaveBeenCalledTimes(4);
  });
});
