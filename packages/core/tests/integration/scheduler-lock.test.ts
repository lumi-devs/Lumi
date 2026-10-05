import { afterAll, afterEach, beforeAll, expect, it } from "bun:test";
import type Valkey from "iovalkey";
import { acquireRedisLock, type RedisLock } from "#lib/lock.js";
import { acquireSchedulerLock } from "#lib/scheduler-lock.js";
import { RedisKeys } from "#lib/database/redis.js";
import { createTestRedis, deleteByPrefix, integrationDescribe } from "./setup.js";

const TestLockPrefix = "lumi:test:int:lock:";

function uniqueLockKey(): string {
  return `${TestLockPrefix}${Date.now()}:${Math.random().toString(36).slice(2)}:`;
}

integrationDescribe("scheduler-lock (real redis)", () => {
  let redis: Valkey;
  let held: RedisLock[] = [];

  beforeAll(() => {
    redis = createTestRedis();
  });

  afterEach(async () => {
    await Promise.all(held.map((lock) => lock.release().catch(() => undefined)));
    held = [];
    await deleteByPrefix(redis, TestLockPrefix);
    await redis.del(RedisKeys.schedulerLeader());
  });

  afterAll(async () => {
    await redis.quit();
  });

  it("acquires an uncontended lock and sets a value readable back via GET", async () => {
    const key = uniqueLockKey();
    const lock = await acquireRedisLock(redis, key);
    held.push(lock);

    const stored = await redis.get(key);
    expect(stored).toBe(lock.token);
  });

  it("release() clears the key so a later acquire on the same key succeeds", async () => {
    const key = uniqueLockKey();
    const first = await acquireRedisLock(redis, key);
    await first.release();

    expect(await redis.get(key)).toBeNull();

    const second = await acquireRedisLock(redis, key);
    held.push(second);
    expect(second.token).not.toBe(first.token);
  });

  it("a contending acquire with acquireTimeoutMs=0 fails fast while the lock is held", async () => {
    const key = uniqueLockKey();
    const first = await acquireRedisLock(redis, key, { ttlMs: 5000 });
    held.push(first);

    await expect(
      acquireRedisLock(redis, key, { acquireTimeoutMs: 0, retryDelayMs: 5 }),
    ).rejects.toThrow(/Timeout acquiring Redis lock/);
  });

  it("a contending acquire with a positive timeout succeeds once the holder releases", async () => {
    const key = uniqueLockKey();
    const first = await acquireRedisLock(redis, key, { ttlMs: 5000 });

    const waiter = acquireRedisLock(redis, key, {
      acquireTimeoutMs: 2000,
      retryDelayMs: 10,
      maxRetryDelayMs: 50,
    });

    await Bun.sleep(50);
    await first.release();

    const second = await waiter;
    held.push(second);
    expect(second.token).not.toBe(first.token);
  });

  it("renews the lease past its original TTL while still held", async () => {
    const key = uniqueLockKey();
    const ttlMs = 200;
    const lock = await acquireRedisLock(redis, key, { ttlMs });
    held.push(lock);

    // Past the original TTL - still alive only because the renewal loop
    // (fires at ttlMs/2) re-armed the PEXPIRE before it could lapse.
    await Bun.sleep(ttlMs + 150);

    const pttl = await redis.pttl(key);
    expect(pttl).toBeGreaterThan(0);
    expect(await redis.get(key)).toBe(lock.token);
  });

  it("acquireSchedulerLock takes the fleet-wide leader key", async () => {
    const lock = await acquireSchedulerLock(redis, () => undefined);
    held.push(lock);

    expect(await redis.get(RedisKeys.schedulerLeader())).toBe(lock.token);
  });

  it("a second acquireSchedulerLock call fails fast while the leader lease is held", async () => {
    const lock = await acquireSchedulerLock(redis, () => undefined);
    held.push(lock);

    await expect(acquireSchedulerLock(redis, () => undefined)).rejects.toThrow(
      /Failed to acquire scheduler lock/,
    );
  });
});
