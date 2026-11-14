import { describe, it, expect, vi, beforeEach, afterEach } from "bun:test";
import { container } from "@lib/Services.js";
import { RedisKeys } from "@redis/Store.js";
import { acquireSchedulerLock } from "@scheduler/Lock.js";

function mockRedis() {
  const store = new Map<string, string>();
  return {
    store,
    set: vi.fn((k: string, v: string, ..._rest: unknown[]) => {
      if (store.has(k)) return Promise.resolve(null);
      store.set(k, v);
      return Promise.resolve("OK");
    }),
    eval: vi.fn(
      (script: string, _numkeys: number, key: string, token?: string) => {
        const current = store.get(key);
        if (script.includes("DEL")) {
          if (current === token) {
            store.delete(key);
            return Promise.resolve(1);
          }
          return Promise.resolve(0);
        }
        return Promise.resolve(current === token ? 1 : 0);
      },
    ),
  };
}


describe("scheduler-lock", () => {
  let redis: ReturnType<typeof mockRedis>;
  const silentLogger = { error: vi.fn(), warn: vi.fn(), debug: vi.fn(), info: vi.fn() };

  beforeEach(() => {
    redis = mockRedis();
    container.logger = { error: vi.fn() } as never;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("claims the scheduler leader key", async () => {
    const lock = await acquireSchedulerLock(redis as never, vi.fn(), silentLogger);
    expect(redis.store.has(RedisKeys.schedulerLeader())).toBe(true);
    await lock.release();
    expect(redis.store.has(RedisKeys.schedulerLeader())).toBe(false);
  });

  it("retries until the deadline then rejects a second claimant instead of running two schedulers", async () => {
    const first = await acquireSchedulerLock(redis as never, vi.fn(), silentLogger);
    const before = redis.set.mock.calls.length;

    await expect(
      acquireSchedulerLock(redis as never, vi.fn(), silentLogger, {
        ttlMs: 200,
        acquireTimeoutMs: 250,
      }),
    ).rejects.toThrow(/Failed to acquire scheduler lock/);

    expect(redis.set.mock.calls.length - before).toBeGreaterThan(1);
    await first.release();
  });

  it("allows immediate acquisition by another claimant after clean release", async () => {
    const first = await acquireSchedulerLock(redis as never, vi.fn(), silentLogger);
    expect(redis.store.has(RedisKeys.schedulerLeader())).toBe(true);

    await first.release();
    expect(redis.store.has(RedisKeys.schedulerLeader())).toBe(false);

    const second = await acquireSchedulerLock(redis as never, vi.fn(), silentLogger);
    expect(redis.store.has(RedisKeys.schedulerLeader())).toBe(true);

    await second.release();
  });
});
