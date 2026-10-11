import { describe, it, expect, vi, beforeEach, afterEach } from "bun:test";
import { container } from "#src/lib/Services.js";
import { ValkeyKeys } from "#src/lib/valkey/Client.js";
import { acquireSchedulerLock } from "#src/lib/scheduler/Lock.js";

function mockValkey() {
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("scheduler-lock", () => {
  let valkey: ReturnType<typeof mockValkey>;
  const silentLogger = { error: vi.fn(), warn: vi.fn(), debug: vi.fn(), info: vi.fn() };

  beforeEach(() => {
    valkey = mockValkey();
    container.logger = { error: vi.fn() } as never;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("claims the scheduler leader key", async () => {
    const lock = await acquireSchedulerLock(valkey as never, vi.fn(), silentLogger);
    expect(valkey.store.has(ValkeyKeys.schedulerLeader())).toBe(true);
    await lock.release();
    expect(valkey.store.has(ValkeyKeys.schedulerLeader())).toBe(false);
  });

  it("rejects a second claimant instead of running two schedulers", async () => {
    const first = await acquireSchedulerLock(valkey as never, vi.fn(), silentLogger);
    const before = valkey.set.mock.calls.length;

    await expect(acquireSchedulerLock(valkey as never, vi.fn(), silentLogger)).rejects.toThrow(
      /Failed to acquire scheduler lock/,
    );

    expect(valkey.set.mock.calls.length).toBeGreaterThan(before);
    await first.release();
  }, 60_000);

  it("retries until the deadline instead of blocking forever", async () => {
    await acquireSchedulerLock(valkey as never, vi.fn(), silentLogger);
    const before = valkey.set.mock.calls.length;

    await expect(acquireSchedulerLock(valkey as never, vi.fn(), silentLogger)).rejects.toThrow(
      /Failed to acquire scheduler lock/,
    );

    const attempts = valkey.set.mock.calls.length - before;
    expect(attempts).toBeGreaterThan(1);
  }, 60_000);

  it("signals loss when the lease is taken over while held", async () => {
    const onLost = vi.fn();
    await acquireSchedulerLock(valkey as never, onLost, silentLogger);

    valkey.store.set(ValkeyKeys.schedulerLeader(), "another-process");
    await sleep(15_000);

    expect(onLost).toHaveBeenCalledTimes(1);
  }, 20_000);

  it("invokes onLost only once across multiple consecutive renewal failures", async () => {
    const onLost = vi.fn();
    const lock = await acquireSchedulerLock(valkey as never, onLost, silentLogger);

    valkey.store.set(ValkeyKeys.schedulerLeader(), "another-process");

    await sleep(15_000);
    expect(onLost).toHaveBeenCalledTimes(1);

    await sleep(15_000);
    expect(onLost).toHaveBeenCalledTimes(1);

    await sleep(15_000);
    expect(onLost).toHaveBeenCalledTimes(1);

    await lock.release();
  }, 50_000);

  it("allows immediate acquisition by another claimant after clean release", async () => {
    const first = await acquireSchedulerLock(valkey as never, vi.fn(), silentLogger);
    expect(valkey.store.has(ValkeyKeys.schedulerLeader())).toBe(true);

    await first.release();
    expect(valkey.store.has(ValkeyKeys.schedulerLeader())).toBe(false);

    const second = await acquireSchedulerLock(valkey as never, vi.fn(), silentLogger);
    expect(valkey.store.has(ValkeyKeys.schedulerLeader())).toBe(true);

    await second.release();
  });

  it("stays quiet while the lease is still ours", async () => {
    const onLost = vi.fn();
    await acquireSchedulerLock(valkey as never, onLost, silentLogger);

    await sleep(45_000);

    expect(onLost).not.toHaveBeenCalled();
  }, 50_000);
});
