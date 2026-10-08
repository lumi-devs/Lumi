import { afterAll, afterEach, beforeAll, expect, it } from "bun:test";
import type Valkey from "iovalkey";
import { acquireValkeyLock, type ValkeyLock } from "@lumi/infrastructure/cache";
import { acquireSchedulerLock } from "#lib/scheduler-lock.js";
import { ValkeyKeys } from "#lib/database/valkey.js";
import { createTestValkey, deleteByPrefix, integrationDescribe } from "./setup.js";

const TestLockPrefix = "lumi:test:int:lock:";

function uniqueLockKey(): string {
  return `${TestLockPrefix}${Date.now()}:${Math.random().toString(36).slice(2)}:`;
}

integrationDescribe("scheduler-lock (real Valkey)", () => {
  let valkey: Valkey;
  let held: ValkeyLock[] = [];

  beforeAll(() => {
    valkey = createTestValkey();
  });

  afterEach(async () => {
    await Promise.all(held.map((lock) => lock.release().catch(() => undefined)));
    held = [];
    await deleteByPrefix(valkey, TestLockPrefix);
    await valkey.del(ValkeyKeys.schedulerLeader());
  });

  afterAll(async () => {
    await valkey.quit();
  });

  it("acquires an uncontended lock and sets a value readable back via GET", async () => {
    const key = uniqueLockKey();
    const lock = await acquireValkeyLock(valkey, key);
    held.push(lock);

    const stored = await valkey.get(key);
    expect(stored).toBe(lock.token);
  });

  it("release() clears the key so a later acquire on the same key succeeds", async () => {
    const key = uniqueLockKey();
    const first = await acquireValkeyLock(valkey, key);
    await first.release();

    expect(await valkey.get(key)).toBeNull();

    const second = await acquireValkeyLock(valkey, key);
    held.push(second);
    expect(second.token).not.toBe(first.token);
  });

  it("a contending acquire with acquireTimeoutMs=0 fails fast while the lock is held", async () => {
    const key = uniqueLockKey();
    const first = await acquireValkeyLock(valkey, key, { ttlMs: 5000 });
    held.push(first);

    await expect(
      acquireValkeyLock(valkey, key, { acquireTimeoutMs: 0, retryDelayMs: 5 }),
    ).rejects.toThrow(/Timeout acquiring Valkey lock/);
  });

  it("a contending acquire with a positive timeout succeeds once the holder releases", async () => {
    const key = uniqueLockKey();
    const first = await acquireValkeyLock(valkey, key, { ttlMs: 5000 });

    const waiter = acquireValkeyLock(valkey, key, {
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
    const lock = await acquireValkeyLock(valkey, key, { ttlMs });
    held.push(lock);

    // Past the original TTL - still alive only because the renewal loop
    // (fires at ttlMs/2) re-armed the PEXPIRE before it could lapse.
    await Bun.sleep(ttlMs + 150);

    const pttl = await valkey.pttl(key);
    expect(pttl).toBeGreaterThan(0);
    expect(await valkey.get(key)).toBe(lock.token);
  });

  it("acquireSchedulerLock takes the fleet-wide leader key", async () => {
    const lock = await acquireSchedulerLock(valkey, () => undefined);
    held.push(lock);

    expect(await valkey.get(ValkeyKeys.schedulerLeader())).toBe(lock.token);
  });

  it("a second acquireSchedulerLock call fails fast while the leader lease is held", async () => {
    const lock = await acquireSchedulerLock(valkey, () => undefined);
    held.push(lock);

    await expect(acquireSchedulerLock(valkey, () => undefined)).rejects.toThrow(
      /Failed to acquire scheduler lock/,
    );
  });
});
