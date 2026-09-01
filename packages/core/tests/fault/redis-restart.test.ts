import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { container } from "@sapphire/framework";
import { acquireRedisLock, verifyRedisLock } from "#lib/redis-lock.js";
import { createGuildTransaction } from "#lib/guild-transaction.js";

vi.mock("@sapphire/framework", () => ({
  container: {
    logger: {
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
    },
    invalidation: { invalidate: vi.fn().mockResolvedValue(undefined) },
    db: {
      config: {
        invalidateGuildSettings: vi.fn().mockResolvedValue(undefined),
      },
    },
  },
}));

interface SimulatedRedisState {
  store: Map<string, string>;
  isOnline: boolean;
  rejectAll: boolean;
}

function createChaosRedis() {
  const state: SimulatedRedisState = {
    store: new Map<string, string>(),
    isOnline: true,
    rejectAll: false,
  };

  const redis = {
    _state: state,
    set: vi.fn(async (k: string, v: string, ..._rest: unknown[]) => {
      if (!state.isOnline || state.rejectAll) {
        throw new Error("ECONNREFUSED: Connection refused by Redis server");
      }
      if (state.store.has(k)) return null;
      state.store.set(k, v);
      return "OK";
    }),
    get: vi.fn(async (k: string) => {
      if (!state.isOnline || state.rejectAll) {
        throw new Error("ECONNREFUSED: Connection refused by Redis server");
      }
      return state.store.get(k) ?? null;
    }),
    eval: vi.fn(async (script: string, _numkeys: number, key: string, token?: string) => {
      if (!state.isOnline || state.rejectAll) {
        throw new Error("ECONNRESET: Connection reset by peer");
      }
      const current = state.store.get(key);
      if (script.includes("DEL")) {
        if (current === token) {
          state.store.delete(key);
          return 1;
        }
        return 0;
      }
      if (script.includes("EXPIRE")) {
        if (current === token) {
          return 1;
        }
        return 0;
      }
      return current === token ? 1 : 0;
    }),
    simulateCrash: () => {
      state.isOnline = false;
    },
    simulateRestart: () => {
      state.isOnline = true;
      state.store.clear();
    },
    simulateNetworkPartition: () => {
      state.rejectAll = true;
    },
    healNetworkPartition: () => {
      state.rejectAll = false;
    },
  };

  return redis;
}

function mockPrisma() {
  return {
    guild: {
      findUnique: vi.fn().mockResolvedValue({ id: "guild-chaos-1", prefix: "!" }),
      create: vi.fn().mockResolvedValue({ id: "guild-chaos-1", prefix: "!" }),
      update: vi.fn().mockResolvedValue({ id: "guild-chaos-1", prefix: "?" }),
    },
  };
}

describe("Chaos Suite: Redis Restart & Lock Loss", () => {
  let redis: ReturnType<typeof createChaosRedis>;
  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    redis = createChaosRedis();
    prisma = mockPrisma();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("aborts GuildWriteTransaction cleanly when Redis restarts and flushes keys mid-transaction", async () => {
    const txn = await createGuildTransaction("guild-chaos-1", redis as any, prisma as any);
    txn.write({ prefix: "?" });

    redis.simulateRestart();

    await expect(txn.submit()).rejects.toThrow(/Lock lost before write/);
    expect(prisma.guild.update).not.toHaveBeenCalled();
    expect(txn.locking).toBe(false);
  });

  it("prevents database write when Redis experiences a network partition during submit", async () => {
    const txn = await createGuildTransaction("guild-chaos-1", redis as any, prisma as any);
    txn.write({ prefix: "?" });

    redis.simulateNetworkPartition();

    await expect(txn.submit()).rejects.toThrow(/ECONNRESET|ECONNREFUSED/);
    expect(prisma.guild.update).not.toHaveBeenCalled();
  });

  it("re-acquires locks successfully after Redis heals from a restart", async () => {
    redis.simulateCrash();
    await expect(
      acquireRedisLock(redis as any, "lock:guild:healed", {
        ttlMs: 2000,
        acquireTimeoutMs: 100,
      }),
    ).rejects.toThrow(/ECONNREFUSED|Timeout/);

    redis.simulateRestart();

    const lock = await acquireRedisLock(redis as any, "lock:guild:healed", {
      ttlMs: 5000,
      acquireTimeoutMs: 500,
    });
    expect(lock.token).toBeDefined();
    expect(await verifyRedisLock(redis as any, "lock:guild:healed", lock.token)).toBe(true);

    await lock.release();
    expect(await verifyRedisLock(redis as any, "lock:guild:healed", lock.token)).toBe(false);
  });

  it("logs consecutive renewal failures during prolonged Redis outage without crashing the process", async () => {
    const lock = await acquireRedisLock(redis as any, "lock:guild:outage", {
      ttlMs: 1000,
    });

    redis.simulateCrash();

    await vi.advanceTimersByTimeAsync(500);
    expect(container.logger.error).toHaveBeenCalledWith(
      expect.stringContaining('[redis-lock] Failed to renew lock "lock:guild:outage" (1 consecutive failure)'),
      expect.any(Error),
    );

    await vi.advanceTimersByTimeAsync(500);
    expect(container.logger.error).toHaveBeenCalledWith(
      expect.stringContaining('[redis-lock] Failed to renew lock "lock:guild:outage" (2 consecutive failures)'),
      expect.any(Error),
    );

    await lock.release();
  });
});
