import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { container } from "@sapphire/framework";
import { RedisKeys } from "#lib/database/redis.js";
import { acquireSchedulerLock } from "#lib/scheduler-lock.js";

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

  beforeEach(() => {
    vi.useFakeTimers();
    redis = mockRedis();
    container.logger = { error: vi.fn() } as never;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("claims the scheduler leader key", async () => {
    const lock = await acquireSchedulerLock(redis as never, vi.fn());
    expect(redis.store.has(RedisKeys.schedulerLeader())).toBe(true);
    await lock.release();
    expect(redis.store.has(RedisKeys.schedulerLeader())).toBe(false);
  });

  it("rejects a second claimant instead of running two schedulers", async () => {
    const first = await acquireSchedulerLock(redis as never, vi.fn());

    await expect(acquireSchedulerLock(redis as never, vi.fn())).rejects.toThrow(
      /Failed to acquire scheduler lock/,
    );

    await first.release();
  });

  it("does not block waiting for the lease to free up", async () => {
    await acquireSchedulerLock(redis as never, vi.fn());
    const before = redis.set.mock.calls.length;

    await expect(acquireSchedulerLock(redis as never, vi.fn())).rejects.toThrow(
      /Failed to acquire scheduler lock/,
    );

    expect(redis.set.mock.calls.length).toBe(before + 1);
  });

  it("signals loss when the lease is taken over while held", async () => {
    const onLost = vi.fn();
    await acquireSchedulerLock(redis as never, onLost);

    redis.store.set(RedisKeys.schedulerLeader(), "another-process");
    await vi.advanceTimersByTimeAsync(15_000);

    expect(onLost).toHaveBeenCalled();
  });

  it("stays quiet while the lease is still ours", async () => {
    const onLost = vi.fn();
    await acquireSchedulerLock(redis as never, onLost);

    await vi.advanceTimersByTimeAsync(45_000);

    expect(onLost).not.toHaveBeenCalled();
  });
});
