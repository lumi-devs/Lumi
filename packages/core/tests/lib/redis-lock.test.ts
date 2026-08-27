import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  acquireRedisLock,
  verifyRedisLock,
} from "#lib/redis-lock.js";

function mockRedis() {
  const store = new Map<string, string>();
  return {
    store,
    set: vi.fn((k: string, v: string, ..._rest: unknown[]) => {
      if (store.has(k)) return Promise.resolve(null);
      store.set(k, v);
      return Promise.resolve("OK");
    }),
    eval: vi.fn((script: string, _numkeys: number, key: string, token?: string) => {
      const current = store.get(key);
      if (script.includes("DEL")) {
        if (current === token) {
          store.delete(key);
          return Promise.resolve(1);
        }
        return Promise.resolve(0);
      }
      if (script.includes("PEXPIRE")) {
        return Promise.resolve(current === token ? 1 : 0);
      }
      // verify script
      return Promise.resolve(current === token ? 1 : 0);
    }),
  };
}

describe("acquireRedisLock", () => {
  let redis: ReturnType<typeof mockRedis>;

  beforeEach(() => {
    vi.useFakeTimers();
    redis = mockRedis();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns a release closure and a fencing token", async () => {
    const lock = await acquireRedisLock(redis as any, "k1", { ttlMs: 5000 });
    expect(typeof lock.release).toBe("function");
    expect(typeof lock.token).toBe("string");
    expect(lock.token.length).toBeGreaterThan(0);
    await lock.release();
  });

  it("verifyRedisLock is true while held and false after release", async () => {
    const lock = await acquireRedisLock(redis as any, "k2", { ttlMs: 5000 });
    await expect(verifyRedisLock(redis as any, "k2", lock.token)).resolves.toBe(true);
    await lock.release();
    await expect(verifyRedisLock(redis as any, "k2", lock.token)).resolves.toBe(false);
  });

  it("verifyRedisLock is false for a different token (stale holder)", async () => {
    const lock = await acquireRedisLock(redis as any, "k3", { ttlMs: 5000 });
    await expect(verifyRedisLock(redis as any, "k3", "some-other-token")).resolves.toBe(false);
    await lock.release();
  });

  it("release is idempotent", async () => {
    const lock = await acquireRedisLock(redis as any, "k4", { ttlMs: 5000 });
    await lock.release();
    await expect(lock.release()).resolves.toBeUndefined();
  });
});
