import { describe, it, expect, vi, beforeEach } from "vitest";
import { ClusterReadyTracker } from "../src/cluster-ready.js";
import { assignShards, ClusterCoordinator } from "../src/coordinator.js";

const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }));

vi.mock("@discordjs/rest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@discordjs/rest")>();
  return {
    ...actual,
    REST: vi.fn().mockImplementation(function (this: unknown) {
      return {
        setToken: vi.fn().mockReturnThis(),
        get: mockGet,
      };
    }),
  };
});

import { planShards } from "../src/shard-planner.js";
import { DiscordAPIError } from "@discordjs/rest";

describe("ClusterReadyTracker", () => {
  let mockRedis: any;
  let members: Map<string, string[]>;

  beforeEach(() => {
    const store = new Map<string, string>();
    members = new Map();
    mockRedis = {
      set: vi.fn((key: string, val: string) => {
        store.set(key, val);
        return Promise.resolve("OK");
      }),
      get: vi.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
      zrange: vi.fn((key: string) => Promise.resolve(members.get(key) ?? [])),
    };
  });

  it("publishes ready state true and returns isReady true once the only live replica is ready", async () => {
    members.set("lumi:cluster:default:members", ["replica-1"]);
    const tracker = new ClusterReadyTracker({
      redis: mockRedis,
      clusterName: "default",
      replicaId: "replica-1",
    });

    expect(await tracker.isReady()).toBe(false);

    await tracker.publishReady(true);
    expect(mockRedis.set).toHaveBeenCalledWith(
      "lumi:cluster:default:ready:replica-1",
      "1",
      "PX",
      30000,
    );
    expect(await tracker.isReady()).toBe(true);
  });

  it("publishes ready state false", async () => {
    members.set("lumi:cluster:production:members", ["replica-1"]);
    const tracker = new ClusterReadyTracker({
      redis: mockRedis,
      clusterName: "production",
      replicaId: "replica-1",
      ttlMs: 15000,
    });

    await tracker.publishReady(false);
    expect(mockRedis.set).toHaveBeenCalledWith(
      "lumi:cluster:production:ready:replica-1",
      "0",
      "PX",
      15000,
    );
    expect(await tracker.isReady()).toBe(false);
  });

  it("stays not-ready while any live replica hasn't reported ready", async () => {
    members.set("lumi:cluster:default:members", ["replica-1", "replica-2"]);
    const tracker = new ClusterReadyTracker({
      redis: mockRedis,
      clusterName: "default",
      replicaId: "replica-1",
    });

    await tracker.publishReady(true);
    expect(await tracker.isReady()).toBe(false);
  });

  it("waitForReady resolves once every live replica is ready", async () => {
    members.set("lumi:cluster:default:members", ["replica-1", "replica-2"]);
    const tracker1 = new ClusterReadyTracker({
      redis: mockRedis,
      clusterName: "default",
      replicaId: "replica-1",
    });
    const tracker2 = new ClusterReadyTracker({
      redis: mockRedis,
      clusterName: "default",
      replicaId: "replica-2",
    });

    await tracker1.publishReady(true);
    await tracker2.publishReady(true);
    await expect(tracker1.waitForReady()).resolves.toBeUndefined();
  });
});

describe("planShards", () => {
  const log = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function gatewayInfo(overrides: Record<string, unknown> = {}) {
    return {
      url: "wss://gateway.discord.gg",
      shards: 4,
      session_start_limit: {
        total: 1000,
        remaining: 999,
        reset_after: 3_600_000,
        max_concurrency: 1,
      },
      ...overrides,
    };
  }

  it("defaults to Discord's recommended shard count when TOTAL_SHARDS is unset", async () => {
    mockGet.mockResolvedValue(gatewayInfo({ shards: 6 }));

    const plan = await planShards({
      token: "t",
      log,
      env: {},
    });

    expect(plan.shardCount).toBe(6);
    expect(plan.recommendedShards).toBe(6);
    expect(plan.shards).toBeUndefined();
    expect(plan.maxConcurrency).toBe(1);
    expect(plan.gatewayUrl).toBe("wss://gateway.discord.gg");
  });

  it("honors an explicit TOTAL_SHARDS override", async () => {
    mockGet.mockResolvedValue(gatewayInfo({ shards: 4 }));

    const plan = await planShards({
      token: "t",
      log,
      env: { TOTAL_SHARDS: "10" },
    });

    expect(plan.shardCount).toBe(10);
    expect(plan.recommendedShards).toBe(4);
  });

  it("rejects a non-positive-integer TOTAL_SHARDS", async () => {
    mockGet.mockResolvedValue(gatewayInfo());

    await expect(
      planShards({
        token: "t",
        log,
        env: { TOTAL_SHARDS: "not-a-number" },
      }),
    ).rejects.toThrow(/positive integer/);
  });

  it("parses SHARD_LIST into the owned shard subset", async () => {
    mockGet.mockResolvedValue(gatewayInfo({ shards: 4 }));

    const plan = await planShards({
      token: "t",
      log,
      env: {
        TOTAL_SHARDS: "4",
        SHARD_LIST: "0, 1",
      },
    });

    expect(plan.shards).toEqual([0, 1]);
    expect(plan.shardCount).toBe(4);
  });

  it("rejects a SHARD_LIST id that is out of range for TOTAL_SHARDS", async () => {
    mockGet.mockResolvedValue(gatewayInfo({ shards: 4 }));

    await expect(
      planShards({
        token: "t",
        log,
        env: {
          TOTAL_SHARDS: "4",
          SHARD_LIST: "4",
        },
      }),
    ).rejects.toThrow(/SHARD_LIST has id 4/);
  });

  it("refuses to start when the session-start limit can't cover the shards to identify", async () => {
    mockGet.mockResolvedValue(
      gatewayInfo({
        shards: 4,
        session_start_limit: {
          total: 1000,
          remaining: 1,
          reset_after: 60_000,
          max_concurrency: 1,
        },
      }),
    );

    await expect(
      planShards({ token: "t", log, env: {} }),
    ).rejects.toThrow(/session_start_limit\.remaining=1/);
  });

  it("allows starting past the session-start limit when SHARD_IDENTIFY_FORCE=true", async () => {
    mockGet.mockResolvedValue(
      gatewayInfo({
        shards: 4,
        session_start_limit: {
          total: 1000,
          remaining: 1,
          reset_after: 60_000,
          max_concurrency: 1,
        },
      }),
    );

    const plan = await planShards({
      token: "t",
      log,
      env: { SHARD_IDENTIFY_FORCE: "true" },
    });

    expect(plan.shardCount).toBe(4);
  });

  it("surfaces a clean error when Discord rejects the token (401)", async () => {
    mockGet.mockRejectedValue(
      new DiscordAPIError(
        { message: "401: Unauthorized", code: 0 },
        0,
        401,
        "GET",
        "/gateway/bot",
        {},
      ),
    );

    await expect(
      planShards({ token: "bad-token", log, env: {} }),
    ).rejects.toThrow(/Discord rejected the bot token/);
  });
});

describe("assignShards", () => {
  it("splits shards as evenly as possible, giving the remainder to the first replicas (sorted)", () => {
    const result = assignShards(["b", "a", "c"], 10);

    // sorted replica order is a, b, c; 10 / 3 = 3 remainder 1, so "a" gets the
    // extra shard.
    expect(result).toEqual({
      a: [0, 1, 2, 3],
      b: [4, 5, 6],
      c: [7, 8, 9],
    });
  });

  it("gives every shard to the single replica when there is only one", () => {
    const result = assignShards(["only"], 5);
    expect(result).toEqual({ only: [0, 1, 2, 3, 4] });
  });

  it("leaves surplus replicas with an empty shard list when replicas outnumber shards", () => {
    const result = assignShards(["a", "b", "c", "d"], 2);
    expect(result).toEqual({ a: [0], b: [1], c: [], d: [] });
  });

  it("returns empty arrays for every replica when shardCount is 0", () => {
    const result = assignShards(["a", "b"], 0);
    expect(result).toEqual({ a: [], b: [] });
  });

  it("returns an empty map when there are no replicas", () => {
    const result = assignShards([], 10);
    expect(result).toEqual({});
  });
});

/** Minimal in-memory Redis stand-in covering what ClusterCoordinator needs. */
function createMockRedis() {
  const kv = new Map<string, string>();
  const ttl = new Map<string, number>();
  const zsets = new Map<string, Map<string, number>>();

  const redis: any = {
    get(key: string) {
      const now = Date.now();
      if (ttl.has(key) && ttl.get(key)! <= now) {
        kv.delete(key);
        ttl.delete(key);
      }
      return Promise.resolve(kv.has(key) ? kv.get(key)! : null);
    },
    set(key: string, val: string, ...flags: unknown[]) {
      const now = Date.now();
      if (ttl.has(key) && ttl.get(key)! <= now) {
        kv.delete(key);
        ttl.delete(key);
      }
      if (flags.includes("NX") && kv.has(key)) return Promise.resolve(null);
      kv.set(key, val);
      const pxIdx = flags.indexOf("PX");
      const exIdx = flags.indexOf("EX");
      if (pxIdx !== -1) ttl.set(key, now + Number(flags[pxIdx + 1]));
      else if (exIdx !== -1) ttl.set(key, now + Number(flags[exIdx + 1]) * 1000);
      else ttl.delete(key);
      return Promise.resolve("OK");
    },
    zadd(key: string, score: number, member: string) {
      if (!zsets.has(key)) zsets.set(key, new Map());
      zsets.get(key)!.set(member, score);
      return Promise.resolve(1);
    },
    zremrangebyscore(key: string, _min: unknown, max: number) {
      const z = zsets.get(key);
      if (!z) return Promise.resolve(0);
      let removed = 0;
      for (const [member, score] of [...z]) {
        if (score <= max) {
          z.delete(member);
          removed++;
        }
      }
      return Promise.resolve(removed);
    },
    zrange(key: string) {
      const z = zsets.get(key);
      if (!z) return Promise.resolve([]);
      return Promise.resolve(
        [...z.entries()].sort((a, b) => a[1] - b[1]).map(([m]) => m),
      );
    },
    zrem(key: string, member: string) {
      return Promise.resolve(zsets.get(key)?.delete(member) ? 1 : 0);
    },
    publish() {
      return Promise.resolve(0);
    },
    multi() {
      const ops: Array<() => Promise<unknown>> = [];
      const chain: any = {
        zadd: (...args: [string, number, string]) => {
          ops.push(() => redis.zadd(...args));
          return chain;
        },
        zremrangebyscore: (...args: [string, unknown, number]) => {
          ops.push(() => redis.zremrangebyscore(...args));
          return chain;
        },
        exec: async () => {
          for (const op of ops) await op();
          return [];
        },
      };
      return chain;
    },
  };
  return redis;
}

function createMockSubscriber() {
  return {
    subscribe: vi.fn().mockResolvedValue(undefined),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
  };
}

describe("ClusterCoordinator", () => {
  it("assigns every shard to a solo replica on join", async () => {
    const redis = createMockRedis();
    const subscriber = createMockSubscriber();
    const coordinator = new ClusterCoordinator({
      redis,
      subscriber,
      clusterName: "test-solo",
      replicaId: "r1",
      shardCount: 4,
      log: () => {},
    });

    const result = await coordinator.join();

    expect(result.shards).toEqual([0, 1, 2, 3]);
    expect(coordinator.getShards()).toEqual([0, 1, 2, 3]);
    expect(result.epoch).toBe(1);

    await coordinator.leave();
  });

  it("splits shards between two replicas and rebalances the existing member on the next reconcile", async () => {
    const redis = createMockRedis();
    const subscriber1 = createMockSubscriber();
    const subscriber2 = createMockSubscriber();

    const r1 = new ClusterCoordinator({
      redis,
      subscriber: subscriber1,
      clusterName: "test-rebalance",
      replicaId: "r1",
      shardCount: 4,
      log: () => {},
      // Expire immediately so r2's join isn't blocked by r1's leader lock.
      leaderLockTtlMs: -1,
    });
    const r2 = new ClusterCoordinator({
      redis,
      subscriber: subscriber2,
      clusterName: "test-rebalance",
      replicaId: "r2",
      shardCount: 4,
      log: () => {},
    });

    await r1.join();
    expect(r1.getShards()).toEqual([0, 1, 2, 3]);

    const r2Result = await r2.join();
    // With both replicas live, assignShards(["r1", "r2"], 4) splits 2/2.
    const expected = assignShards(["r1", "r2"], 4);
    expect(r2Result.shards).toEqual(expected["r2"]);
    expect(r2.getShards()).toEqual([2, 3]);

    // r1 hasn't reconciled since r2 joined (its heartbeat timer hasn't
    // ticked); simulate the rebalance pubsub push it would get in production.
    const r1MessageHandler = subscriber1.on.mock.calls.find(
      (c: unknown[]) => c[0] === "message",
    )?.[1] as (channel: string, payload: string) => void;
    expect(r1MessageHandler).toBeTypeOf("function");

    const onRebalance = vi.fn();
    r1.onRebalance(onRebalance);
    r1MessageHandler("lumi:cluster:test-rebalance:rebalance", "2");
    // applyAssignmentFromRedis() is fire-and-forget from the handler; flush it.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(r1.getShards()).toEqual(expected["r1"]);
    expect(onRebalance).toHaveBeenCalledWith(
      expect.objectContaining({ removed: [2, 3] }),
      expect.objectContaining({ epoch: 2 }),
    );

    await r1.leave();
    await r2.leave();
  });
});
