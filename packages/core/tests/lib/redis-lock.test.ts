import { describe, it, expect, vi, beforeEach, afterEach } from "bun:test";
import { container } from "@sapphire/framework";
import {
  acquireRedisLock,
  verifyRedisLock,
  RedisExtendScript,
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
    eval: vi.fn((script: string, _numkeys: number, key: string, token?: string, _ttl?: string) => {
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
      return Promise.resolve(current === token ? 1 : 0);
    }),
  };
}

// bun:test's fake-timer support only mocks the system clock (Date.now), not
// the setInterval/setTimeout queue, so these wait on the real clock instead —
// acquireRedisLock's renewal interval and retry backoff are real timers.
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("redis-lock", () => {
  let redis: ReturnType<typeof mockRedis>;

  beforeEach(() => {
    redis = mockRedis();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("fencing token and verification", () => {
    it("returns a release closure and a valid fencing token", async () => {
      const lock = await acquireRedisLock(redis as any, "lock:guild:1", { ttlMs: 5000 });
      expect(typeof lock.release).toBe("function");
      expect(typeof lock.token).toBe("string");
      expect(lock.token.length).toBeGreaterThan(0);
      await lock.release();
    });

    it("verifies lock holder while held and returns false after release", async () => {
      const lock = await acquireRedisLock(redis as any, "lock:guild:2", { ttlMs: 5000 });
      await expect(verifyRedisLock(redis as any, "lock:guild:2", lock.token)).resolves.toBe(true);
      await lock.release();
      await expect(verifyRedisLock(redis as any, "lock:guild:2", lock.token)).resolves.toBe(false);
    });

    it("rejects stale token verification when token does not match", async () => {
      const lock = await acquireRedisLock(redis as any, "lock:guild:3", { ttlMs: 5000 });
      await expect(verifyRedisLock(redis as any, "lock:guild:3", "stale-token-123")).resolves.toBe(false);
      await lock.release();
    });

    it("returns false for nonexistent key", async () => {
      await expect(verifyRedisLock(redis as any, "lock:nonexistent", "some-token")).resolves.toBe(false);
    });

    it("throws error when acquire times out", async () => {
      redis.set.mockResolvedValue(null);
      const acquirePromise = acquireRedisLock(redis as any, "lock:busy", {
        acquireTimeoutMs: 100,
        retryDelayMs: 20,
        maxRetryDelayMs: 50,
      });

      const assertionPromise = expect(acquirePromise).rejects.toThrow(
        "Timeout acquiring Redis lock: lock:busy",
      );

      await sleep(200);
      await assertionPromise;
    });
  });

  describe("lock renewal", () => {
    it("renews lock automatically at half ttl intervals when held", async () => {
      const lock = await acquireRedisLock(redis as any, "lock:renew:1", { ttlMs: 4000 });
      const evalSpy = redis.eval;

      await sleep(2000);
      expect(evalSpy).toHaveBeenCalledWith(
        RedisExtendScript,
        1,
        "lock:renew:1",
        lock.token,
        "4000",
      );

      await lock.release();
    });

    it("handles renewal failure when key expired or was stolen (res === 0)", async () => {
      const errorLogger = vi.fn();
      (container as any).logger = { error: errorLogger };

      const lock = await acquireRedisLock(redis as any, "lock:renew:stolen", { ttlMs: 4000 });

      redis.store.delete("lock:renew:stolen");

      await sleep(2000);
      expect(errorLogger).toHaveBeenCalledWith(
        '[redis-lock] Failed to renew lock "lock:renew:stolen" (1 consecutive failure)',
      );

      await sleep(2000);
      expect(errorLogger).toHaveBeenCalledWith(
        '[redis-lock] Failed to renew lock "lock:renew:stolen" (2 consecutive failures)',
      );

      redis.store.set("lock:renew:stolen", lock.token);
      await sleep(2000);

      redis.store.delete("lock:renew:stolen");
      await sleep(2000);
      expect(errorLogger).toHaveBeenLastCalledWith(
        '[redis-lock] Failed to renew lock "lock:renew:stolen" (1 consecutive failure)',
      );

      await lock.release();
      delete (container as any).logger;
    }, 12_000);

    it("handles Redis connection failure during renewal and notifies onLostLock once", async () => {
      const errorLogger = vi.fn();
      const onLostLock = vi.fn();
      (container as any).logger = { error: errorLogger };

      const lock = await acquireRedisLock(redis as any, "lock:renew:err", {
        ttlMs: 4000,
        onLostLock,
      });

      const redisErr = new Error("Connection reset by peer");
      redis.eval.mockRejectedValueOnce(redisErr);

      await sleep(2000);

      expect(errorLogger).toHaveBeenCalledWith(
        '[redis-lock] Failed to renew lock "lock:renew:err" (1 consecutive failure)',
        redisErr,
      );
      expect(onLostLock).toHaveBeenCalledTimes(1);

      // Subsequent failure should not trigger onLostLock again
      redis.eval.mockRejectedValueOnce(new Error("Still down"));
      await sleep(2000);
      expect(onLostLock).toHaveBeenCalledTimes(1);

      await lock.release();
      delete (container as any).logger;
    }, 10_000);

    it("calls onLostLock on the first renewal failure only, not on subsequent failures", async () => {
      const onLostLock = vi.fn();
      const lock = await acquireRedisLock(redis as any, "lock:renew:stolen:callback", {
        ttlMs: 4000,
        onLostLock,
      });

      redis.store.delete("lock:renew:stolen:callback");

      await sleep(2000);
      expect(onLostLock).toHaveBeenCalledTimes(1);

      await sleep(2000);
      expect(onLostLock).toHaveBeenCalledTimes(1);

      await sleep(2000);
      expect(onLostLock).toHaveBeenCalledTimes(1);

      await lock.release();
    }, 10_000);

    it("renews after temporary Redis failure that recovers", async () => {
      const errorLogger = vi.fn();
      (container as any).logger = { error: errorLogger };

      const lock = await acquireRedisLock(redis as any, "lock:renew:recover", { ttlMs: 4000 });

      const redisErr = new Error("Temporary network timeout");
      redis.eval.mockRejectedValueOnce(redisErr);

      await sleep(2000);
      expect(errorLogger).toHaveBeenCalledWith(
        '[redis-lock] Failed to renew lock "lock:renew:recover" (1 consecutive failure)',
        redisErr,
      );

      await sleep(2000);

      redis.eval.mockRejectedValueOnce(redisErr);
      await sleep(2000);
      expect(errorLogger).toHaveBeenLastCalledWith(
        '[redis-lock] Failed to renew lock "lock:renew:recover" (1 consecutive failure)',
        redisErr,
      );

      await lock.release();
      delete (container as any).logger;
    }, 10_000);

    it("falls back to console.error when container.logger is undefined", async () => {
      const originalLogger = container.logger;
      delete (container as any).logger;
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const lock = await acquireRedisLock(redis as any, "lock:renew:console", { ttlMs: 4000 });
      redis.store.delete("lock:renew:console");

      await sleep(2000);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[redis-lock] Failed to renew lock "lock:renew:console" (1 consecutive failure)',
      );

      await lock.release();
      consoleErrorSpy.mockRestore();
      if (originalLogger) {
        (container as any).logger = originalLogger;
      }
    });
  });

  describe("release idempotency", () => {
    it("releases lock once and subsequent calls are no-op", async () => {
      const lock = await acquireRedisLock(redis as any, "lock:release:1", { ttlMs: 5000 });
      expect(redis.store.has("lock:release:1")).toBe(true);

      await lock.release();
      expect(redis.store.has("lock:release:1")).toBe(false);

      const evalCallsBefore = redis.eval.mock.calls.length;
      await expect(lock.release()).resolves.toBeUndefined();
      expect(redis.eval.mock.calls.length).toBe(evalCallsBefore);
    });

    it("stops renewal interval upon release", async () => {
      const lock = await acquireRedisLock(redis as any, "lock:release:2", { ttlMs: 4000 });
      await lock.release();

      const evalCount = redis.eval.mock.calls.length;
      await sleep(10000);

      expect(redis.eval.mock.calls.length).toBe(evalCount);
    }, 12_000);
  });

  describe("concurrency and mutual exclusion", () => {
    it("allows only one concurrent acquirer for the same lock key", async () => {
      const lock1 = await acquireRedisLock(redis as any, "lock:concurrent", {
        acquireTimeoutMs: 50,
      });
      expect(redis.store.get("lock:concurrent")).toBe(lock1.token);

      const acquire2 = acquireRedisLock(redis as any, "lock:concurrent", {
        acquireTimeoutMs: 50,
      });

      const assertion = expect(acquire2).rejects.toThrow(
        "Timeout acquiring Redis lock: lock:concurrent",
      );

      await sleep(100);
      await assertion;

      await lock1.release();
    });

    it("allows immediate acquisition after lock released before TTL expiry", async () => {
      const lock1 = await acquireRedisLock(redis as any, "lock:handoff", {
        ttlMs: 30_000,
        acquireTimeoutMs: 1_000,
      });

      await sleep(5_000);
      await lock1.release();

      const lock2 = await acquireRedisLock(redis as any, "lock:handoff", {
        acquireTimeoutMs: 50,
      });
      expect(lock2.token).toBeDefined();
      expect(lock2.token).not.toBe(lock1.token);
      expect(redis.store.get("lock:handoff")).toBe(lock2.token);

      await lock2.release();
    }, 8000);
  });
});
