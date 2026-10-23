import { describe, expect, test } from "bun:test";
import type { InvalidationPort } from "@lumi/redis";
import { Cache, type CacheRedis } from "../src/index.ts";

interface Stored {
  value: string;
  expiresAt: number;
}

class MemoryRedis implements CacheRedis {
  public readonly values = new Map<string, Stored>();
  public gets = 0;
  public writes = 0;
  public lastSeconds = 0;
  public now = 0;

  public async get(key: string): Promise<string | null> {
    this.gets++;
    const entry = this.values.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= this.now) {
      this.values.delete(key);
      return null;
    }
    return entry.value;
  }

  public async setex(key: string, seconds: number, value: string): Promise<unknown> {
    this.writes++;
    this.lastSeconds = seconds;
    this.values.set(key, { value, expiresAt: this.now + seconds * 1_000 });
    return "OK";
  }

  public async del(...keys: string[]): Promise<unknown> {
    for (const key of keys) this.values.delete(key);
    return keys.length;
  }

  public async mget(...keys: string[]): Promise<(string | null)[]> {
    return Promise.all(keys.map((key) => this.get(key)));
  }
}

class FakeInvalidation implements InvalidationPort {
  readonly #listeners = new Set<(keys: readonly string[]) => void>();
  readonly #resync = new Set<() => void>();

  public constructor(private readonly redis: MemoryRedis) {}

  public async invalidate(...keys: string[]): Promise<void> {
    await this.redis.del(...keys);
    this.fire(keys);
  }

  public onInvalidate(listener: (keys: readonly string[]) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  public onResync(listener: () => void): () => void {
    this.#resync.add(listener);
    return () => this.#resync.delete(listener);
  }

  public fire(keys: readonly string[]): void {
    for (const listener of this.#listeners) listener(keys);
  }

  public resync(): void {
    for (const listener of this.#resync) listener();
  }

  public async start(): Promise<void> {}
  public async close(): Promise<void> {}
}

function cache(redis: MemoryRedis, options: Partial<ConstructorParameters<typeof Cache>[0]> = {}): Cache {
  return new Cache({ redis, ...options });
}

describe("Cache", () => {
  test("serves the second read from L1", async () => {
    const redis = new MemoryRedis();
    const subject = cache(redis);
    let loads = 0;
    const load = async (): Promise<string> => {
      loads++;
      return "value";
    };

    expect(await subject.getOrLoad("test", "k", 60_000, load)).toBe("value");
    expect(await subject.getOrLoad("test", "k", 60_000, load)).toBe("value");
    expect(loads).toBe(1);
    expect(redis.gets).toBe(1);
  });

  test("hydrates L1 from Redis", async () => {
    const redis = new MemoryRedis();
    redis.now = 0;
    const first = cache(redis);
    await first.getOrLoad("test", "k", 60_000, async () => "value");

    const second = cache(redis);
    let loads = 0;
    expect(
      await second.getOrLoad("test", "k", 60_000, async () => {
        loads++;
        return "other";
      }),
    ).toBe("value");
    expect(loads).toBe(0);
    expect(second.localSize()).toBe(1);
  });

  test("negative-caches misses and lets a write replace them", async () => {
    const redis = new MemoryRedis();
    const subject = cache(redis);
    await subject.getOrLoad("test", "k", 60_000, async () => null);

    let loads = 0;
    expect(
      await subject.getOrLoad("test", "k", 60_000, async () => {
        loads++;
        return "value";
      }),
    ).toBeNull();
    expect(loads).toBe(0);

    await subject.set("test", "k", "value", 60_000);
    expect(await subject.getOrLoad("test", "k", 60_000, async () => "stale")).toBe("value");
  });

  test("collapses concurrent loads into one flight", async () => {
    const redis = new MemoryRedis();
    const subject = cache(redis);
    let loads = 0;
    let release!: (value: string) => void;
    const pending = new Promise<string>((resolve) => {
      release = resolve;
    });
    const load = async (): Promise<string> => {
      loads++;
      return pending;
    };

    const first = subject.getOrLoad("test", "k", 60_000, load);
    const second = subject.getOrLoad("test", "k", 60_000, load);
    release("value");

    expect(await Promise.all([first, second])).toEqual(["value", "value"]);
    expect(loads).toBe(1);
  });

  test("does not persist a load that was invalidated mid-flight", async () => {
    const redis = new MemoryRedis();
    const invalidation = new FakeInvalidation(redis);
    const subject = cache(redis, { invalidation });
    let release!: (value: string) => void;
    const pending = new Promise<string>((resolve) => {
      release = resolve;
    });

    const result = subject.getOrLoad("test", "k", 60_000, async () => pending);
    invalidation.fire(["k"]);
    release("stale");

    expect(await result).toBe("stale");
    expect(redis.values.has("k")).toBe(false);
    expect(redis.writes).toBe(0);
  });

  test("publishes exact-key invalidation and drops local state", async () => {
    const redis = new MemoryRedis();
    const invalidation = new FakeInvalidation(redis);
    const subject = cache(redis, { invalidation });
    const namespaced = subject.namespace("test");
    let loads = 0;
    const load = async (): Promise<string> => {
      loads++;
      return `value-${loads}`;
    };

    await namespaced.getOrLoad("k", 60_000, load);
    await namespaced.delete("k");
    expect(redis.values.has("k")).toBe(false);
    expect(await namespaced.getOrLoad("k", 60_000, load)).toBe("value-2");
  });

  test("jitters TTLs inside the configured bound", async () => {
    const redis = new MemoryRedis();
    const subject = cache(redis, { random: () => 1, jitter: 0.1 });
    await subject.getOrLoad("test", "k", 10_000, async () => "value");
    expect(redis.lastSeconds).toBe(11);
  });

  test("evicts the least recently used L1 entry", async () => {
    const redis = new MemoryRedis();
    const subject = cache(redis, { l1MaxEntries: 2 });
    const loads = new Map<string, number>();
    const load = (key: string) => async (): Promise<string> => {
      loads.set(key, (loads.get(key) ?? 0) + 1);
      return key;
    };

    await subject.getOrLoad("test", "a", 60_000, load("a"));
    await subject.getOrLoad("test", "b", 60_000, load("b"));
    await subject.getOrLoad("test", "c", 60_000, load("c"));
    expect(subject.localSize()).toBe(2);

    await redis.del("a");
    await subject.getOrLoad("test", "a", 60_000, load("a"));
    expect(loads.get("a")).toBe(2);
  });

  test("round-trips Dates and BigInts through Redis", async () => {
    const redis = new MemoryRedis();
    const first = cache(redis);
    const value = { at: new Date("2026-10-23T10:00:00.000Z"), count: 42n };
    await first.getOrLoad("test", "k", 60_000, async () => value);

    const second = cache(redis);
    const loaded = await second.getOrLoad<{ at: Date; count: bigint }>(
      "test",
      "k",
      60_000,
      async () => null,
    );
    expect(loaded?.at).toBeInstanceOf(Date);
    expect(loaded?.at.toISOString()).toBe("2026-10-23T10:00:00.000Z");
    expect(loaded?.count).toBe(42n);
  });

  test("getMany hydrates L1 and falls through to Redis", async () => {
    const redis = new MemoryRedis();
    const subject = cache(redis, { l1MaxEntries: 1 });
    await subject.set("test", "a", "A", 60_000);
    await subject.set("test", "b", "B", 60_000);

    const values = await subject.getMany<string>("test", ["a", "b", "c"]);
    expect(values).toEqual(["A", "B", null]);
    expect(subject.localSize()).toBe(1);
  });

  test("expires L1 entries without touching Redis", async () => {
    const redis = new MemoryRedis();
    let now = 0;
    const subject = cache(redis, { now: () => now, l1TtlMs: 1_000 });
    await subject.getOrLoad("test", "k", 60_000, async () => "value");

    now = 2_000;
    let loads = 0;
    expect(
      await subject.getOrLoad("test", "k", 60_000, async () => {
        loads++;
        return "redis";
      }),
    ).toBe("value");
    expect(loads).toBe(0);
  });

  test("does not keep L1 longer than the requested TTL", async () => {
    const redis = new MemoryRedis();
    let now = 0;
    redis.now = now;
    const subject = cache(redis, { now: () => now });
    await subject.getOrLoad("test", "k", 1_000, async () => "value");
    await redis.del("k");

    now = 1_500;
    redis.now = now;
    let loads = 0;
    expect(
      await subject.getOrLoad("test", "k", 60_000, async () => {
        loads++;
        return "next";
      }),
    ).toBe("next");
    expect(loads).toBe(1);
  });
});
