import { describe, expect, test } from "bun:test";
import { claim, withLock, type RedisClient } from "../src/index.ts";

class MemoryRedis {
  public readonly values = new Map<string, string>();

  public async set(key: string, value: string, ...args: unknown[]): Promise<string | null> {
    if (args.includes("NX") && this.values.has(key)) return null;
    this.values.set(key, value);
    return "OK";
  }

  public async eval(script: string, _keys: number, key: string, token: string): Promise<number> {
    if (this.values.get(key) !== token) return 0;
    if (script.includes("pexpire")) return 1;
    this.values.delete(key);
    return 1;
  }
}

describe("locks", () => {
  test("claims a cooldown once", async () => {
    const redis = new MemoryRedis() as unknown as RedisClient;
    expect(await claim(redis, "k", 1_000)).toBe(true);
    expect(await claim(redis, "k", 1_000)).toBe(false);
  });

  test("runs work under a lock and releases it", async () => {
    const memory = new MemoryRedis();
    const redis = memory as unknown as RedisClient;
    const result = await withLock(redis, "k", 1_000, async () => "value");
    expect(result).toEqual({ acquired: true, value: "value" });
    expect(memory.values.has("k")).toBe(false);
  });

  test("does not run work when the lock is held", async () => {
    const memory = new MemoryRedis();
    const redis = memory as unknown as RedisClient;
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = withLock(redis, "k", 1_000, async () => pending);
    const second = await withLock(redis, "k", 1_000, async () => "second");

    expect(second).toEqual({ acquired: false });
    release();
    expect(await first).toEqual({ acquired: true, value: undefined });
  });
});
