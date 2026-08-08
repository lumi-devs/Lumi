import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ShardTelemetryPublisher,
  readClusterShards,
  type ShardTelemetrySample,
} from "../src/shard-telemetry.js";

const CLUSTER = "test";

function fakeRedis() {
  const store = new Map<string, string>();
  const zset = new Map<string, number>();
  const commands: { cmd: string; args: unknown[] }[] = [];

  const multi = () => {
    const queued: (() => void)[] = [];
    const chain: any = {
      set: (key: string, value: string, ..._rest: unknown[]) => {
        queued.push(() => store.set(key, value));
        commands.push({ cmd: "set", args: [key, value] });
        return chain;
      },
      del: (key: string) => {
        queued.push(() => store.delete(key));
        commands.push({ cmd: "del", args: [key] });
        return chain;
      },
      exec: () => {
        for (const run of queued) run();
        return Promise.resolve([]);
      },
    };
    return chain;
  };

  return {
    store,
    zset,
    commands,
    multi,
    get: vi.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    mget: vi.fn((...keys: string[]) =>
      Promise.resolve(keys.map((k) => store.get(k) ?? null)),
    ),
    zrange: vi.fn((_key: string, _start: number, _stop: number, _opt?: string) =>
      Promise.resolve(
        [...zset.entries()].flatMap(([id, score]) => [id, String(score)]),
      ),
    ),
    scan: vi.fn((_cursor: string, _m: string, pattern: string) => {
      const prefix = pattern.replace(/\\(.)/g, "$1").replace(/\*$/, "");
      return Promise.resolve([
        "0",
        [...store.keys()].filter((k) => k.startsWith(prefix)),
      ]);
    }),
  } as any;
}

function sample(shardId: number, over: Partial<ShardTelemetrySample> = {}): ShardTelemetrySample {
  return {
    shardId,
    status: "Ready",
    ping: 42,
    guildCount: 10,
    shardCount: 4,
    ...over,
  };
}

describe("ShardTelemetryPublisher", () => {
  let redis: ReturnType<typeof fakeRedis>;

  beforeEach(() => {
    vi.useFakeTimers();
    redis = fakeRedis();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("writes one TTL'd row per owned shard, stamped with the replica id", async () => {
    const publisher = new ShardTelemetryPublisher({
      redis,
      clusterName: CLUSTER,
      replicaId: "gw-a",
      sample: () => [sample(0), sample(1)],
    });

    await publisher.publish();

    const row = JSON.parse(redis.store.get(`lumi:cluster:${CLUSTER}:shard:1`));
    expect(row).toMatchObject({ shardId: 1, replicaId: "gw-a", ping: 42 });
    expect(typeof row.updatedAt).toBe("number");

    const write = redis.commands.find(
      (c) => c.cmd === "set" && c.args[0] === `lumi:cluster:${CLUSTER}:shard:0`,
    );
    expect(write).toBeDefined();
  });

  it("drops rows for shards it no longer owns instead of waiting out the TTL", async () => {
    let owned = [sample(0), sample(1)];
    const publisher = new ShardTelemetryPublisher({
      redis,
      clusterName: CLUSTER,
      replicaId: "gw-a",
      sample: () => owned,
    });

    await publisher.publish();
    owned = [sample(0)];
    await publisher.publish();

    expect(redis.store.has(`lumi:cluster:${CLUSTER}:shard:0`)).toBe(true);
    expect(redis.store.has(`lumi:cluster:${CLUSTER}:shard:1`)).toBe(false);
  });

  it("clears its rows on stop so a graceful shutdown does not read as healthy", async () => {
    const publisher = new ShardTelemetryPublisher({
      redis,
      clusterName: CLUSTER,
      replicaId: "gw-a",
      sample: () => [sample(0)],
    });

    await publisher.publish();
    await publisher.stop();

    expect(redis.store.has(`lumi:cluster:${CLUSTER}:shard:0`)).toBe(false);
  });
});

describe("readClusterShards", () => {
  let redis: ReturnType<typeof fakeRedis>;

  beforeEach(() => {
    redis = fakeRedis();
  });

  async function publish(replicaId: string, samples: ShardTelemetrySample[]) {
    await new ShardTelemetryPublisher({
      redis,
      clusterName: CLUSTER,
      replicaId,
      sample: () => samples,
    }).publish();
  }

  it("reports shards assigned to a dead replica as missing", async () => {
    redis.store.set(
      `lumi:cluster:${CLUSTER}:assignment`,
      JSON.stringify({
        epoch: 7,
        shardCount: 4,
        byReplica: { "gw-a": [0, 1], "gw-b": [2, 3] },
        writtenAt: 1_000,
      }),
    );
    redis.zset.set("gw-a", 5_000);
    redis.store.set(`lumi:cluster:${CLUSTER}:ready:gw-a`, "1");
    await publish("gw-a", [sample(0), sample(1)]);

    const snapshot = await readClusterShards({ redis, clusterName: CLUSTER });

    expect(snapshot.clustered).toBe(true);
    expect(snapshot.epoch).toBe(7);
    expect(snapshot.shardCount).toBe(4);
    expect(snapshot.missingShardIds).toEqual([2, 3]);
    expect(snapshot.shards.map((s) => s.shardId)).toEqual([0, 1]);

    const gwB = snapshot.replicas.find((r) => r.replicaId === "gw-b");
    expect(gwB).toMatchObject({
      lastSeenAt: null,
      ready: null,
      assignedShardIds: [2, 3],
      reportingShardIds: [],
    });
    const gwA = snapshot.replicas.find((r) => r.replicaId === "gw-a");
    expect(gwA).toMatchObject({ lastSeenAt: 5_000, ready: true });
  });

  it("derives the expected shard count from reporting rows when no assignment exists", async () => {
    await publish("solo", [sample(0, { shardCount: 2 })]);

    const snapshot = await readClusterShards({ redis, clusterName: CLUSTER });

    expect(snapshot.clustered).toBe(false);
    expect(snapshot.epoch).toBeNull();
    expect(snapshot.shardCount).toBe(2);
    expect(snapshot.missingShardIds).toEqual([1]);
    expect(snapshot.replicas.map((r) => r.replicaId)).toEqual(["solo"]);
  });

  it("attaches the persisted gateway session for shards that have one", async () => {
    await publish("gw-a", [sample(0), sample(1)]);
    redis.store.set(
      `lumi:cluster:${CLUSTER}:session:0`,
      JSON.stringify({
        shardId: 0,
        shardCount: 2,
        sessionId: "s",
        sequence: 991,
        resumeURL: "wss://resume.example",
      }),
    );

    const snapshot = await readClusterShards({ redis, clusterName: CLUSTER });

    expect(snapshot.shards[0]!.session).toEqual({
      sequence: 991,
      resumeUrl: "wss://resume.example",
    });
    expect(snapshot.shards[1]!.session).toBeNull();
  });

  it("returns an empty topology when nothing has ever reported", async () => {
    const snapshot = await readClusterShards({ redis, clusterName: CLUSTER });

    expect(snapshot.shardCount).toBe(0);
    expect(snapshot.shards).toEqual([]);
    expect(snapshot.replicas).toEqual([]);
    expect(snapshot.missingShardIds).toEqual([]);
  });
});
