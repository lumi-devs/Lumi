import { PrefixCache } from "#lib/client/PrefixCache.js";
import { InvalidationBus } from "#lib/database/redis.js";
import { describe, expect, test, vi } from "vitest";

describe("PrefixCache", () => {
  test("caches guild prefixes and returns them on hit", () => {
    const cache = new PrefixCache();
    expect(cache.get("guild-1")).toBeNull();

    cache.set("guild-1", ["!", "?"]);
    expect(cache.get("guild-1")).toEqual(["!", "?"]);
  });

  test("respects TTL expiration", async () => {
    const cache = new PrefixCache({ defaultTtlMs: 20 });
    cache.set("guild-1", ["!"]);
    expect(cache.get("guild-1")).toEqual(["!"]);

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(cache.get("guild-1")).toBeNull();
    expect(cache.size).toBe(0);
  });

  test("bounds cache size and evicts oldest entries", () => {
    const cache = new PrefixCache({ maxEntries: 2 });
    cache.set("guild-1", ["!"]);
    cache.set("guild-2", ["?"]);
    expect(cache.size).toBe(2);

    cache.set("guild-3", ["$"]);
    expect(cache.size).toBe(2);
    expect(cache.get("guild-1")).toBeNull();
    expect(cache.get("guild-2")).toEqual(["?"]);
    expect(cache.get("guild-3")).toEqual(["$"]);
  });

  test("manages global prefix caching", async () => {
    const cache = new PrefixCache({ defaultTtlMs: 20 });
    expect(cache.getGlobal()).toBeNull();

    cache.setGlobal("!");
    expect(cache.getGlobal()).toBe("!");

    cache.deleteGlobal();
    expect(cache.getGlobal()).toBeNull();

    cache.setGlobal("!", 10);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(cache.getGlobal()).toBeNull();
  });

  test("handles invalidation keys correctly", () => {
    const cache = new PrefixCache();
    cache.set("guild-1", ["!"]);
    cache.set("guild-2", ["?"]);
    cache.setGlobal("!");

    cache.handleInvalidations(["lumi:prefix:guild:guild-1"]);
    expect(cache.get("guild-1")).toBeNull();
    expect(cache.get("guild-2")).toEqual(["?"]);
    expect(cache.getGlobal()).toBe("!");

    cache.handleInvalidations(["lumi:settings:guild:guild-2"]);
    expect(cache.get("guild-2")).toBeNull();

    cache.handleInvalidations(["lumi:cfg:global"]);
    expect(cache.getGlobal()).toBeNull();

    cache.set("guild-1", ["!"]);
    cache.setGlobal("!");
    cache.handleInvalidations(["*"]);
    expect(cache.get("guild-1")).toBeNull();
    expect(cache.getGlobal()).toBeNull();
  });

  test("attaches to InvalidationBus and unbinds cleanly", () => {
    let messageListener: ((channel: string, payload: string) => void) | undefined;
    const fakeSubscriber = {
      on: vi.fn((event: string, fn: any) => {
        if (event === "message") messageListener = fn;
      }),
      subscribe: vi.fn().mockResolvedValue(undefined),
      unsubscribe: vi.fn().mockResolvedValue(undefined),
      quit: vi.fn().mockResolvedValue("OK"),
    };

    const bus = new InvalidationBus(fakeSubscriber as any);
    const cache = new PrefixCache();
    cache.set("guild-1", ["!"]);
    cache.setGlobal("!");

    const unbind = cache.attachToInvalidationBus(bus);

    // Trigger start to register listeners
    bus.start();

    expect(typeof messageListener).toBe("function");

    // Invalidate guild-1
    messageListener!(
      "lumi:cache:invalidate",
      JSON.stringify({ keys: ["lumi:prefix:guild:guild-1"] }),
    );
    expect(cache.get("guild-1")).toBeNull();
    expect(cache.getGlobal()).toBe("!");

    unbind();
    expect(cache.size).toBe(0);
    expect(cache.getGlobal()).toBeNull();
  });
});

describe("InvalidationBus payload guards", () => {
  test("filters malformed and non-array payloads without throwing", () => {
    let messageListener: ((channel: string, payload: string) => void) | undefined;
    const fakeSubscriber = {
      on: vi.fn((event: string, fn: any) => {
        if (event === "message") messageListener = fn;
      }),
      subscribe: vi.fn().mockResolvedValue(undefined),
      unsubscribe: vi.fn().mockResolvedValue(undefined),
      quit: vi.fn().mockResolvedValue("OK"),
    };

    const bus = new InvalidationBus(fakeSubscriber as any);
    const listener = vi.fn();
    bus.onInvalidate(listener);
    bus.start();

    expect(typeof messageListener).toBe("function");

    // Invalid JSON
    messageListener!("chan", "not-json{");
    expect(listener).not.toHaveBeenCalled();

    // Not an object or null
    messageListener!("chan", "null");
    messageListener!("chan", "123");
    messageListener!("chan", '"string"');
    expect(listener).not.toHaveBeenCalled();

    // keys is not an array
    messageListener!("chan", JSON.stringify({ keys: "string-key" }));
    messageListener!("chan", JSON.stringify({ keys: 123 }));
    messageListener!("chan", JSON.stringify({ keys: null }));
    expect(listener).not.toHaveBeenCalled();

    // keys has non-strings or empty strings
    messageListener!("chan", JSON.stringify({ keys: ["", null, 123, undefined] }));
    expect(listener).not.toHaveBeenCalled();

    // Valid keys mixed with invalid keys
    messageListener!(
      "chan",
      JSON.stringify({ keys: ["valid-key-1", "", 123, "valid-key-2"] }),
    );
    expect(listener).toHaveBeenCalledWith(["valid-key-1", "valid-key-2"]);
  });
});
