import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ShardTelemetryPublisher,
  readClusterShards,
  type ShardTelemetrySample,
} from "../src/shard-telemetry.js";

const CLUSTER = "test";

function fakeRedis() {
  const store = new Map<string, string>();
  const commands: { cmd: string; args: unknown[] }[] = [];

  return {
    store,
    commands,
    set: vi.fn((key: string, value: string, ..._rest: unknown[]) => {
      store.set(key, value);
      commands.push({ cmd: "set", args: [key, value] });
      return Promise.resolve("OK");
    }),
    del: vi.fn((...keys: string[]) => {
      for (const key of keys) store.delete(key);
      commands.push({ cmd: "del", args: keys });
      return Promise.resolve(keys.length);
    }),
    get: vi.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
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
      (c: { cmd: string; args: unknown[] }) =>
        c.cmd === "set" && c.args[0] === `lumi:cluster:${CLUSTER}:shard:0`,
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

  it("derives the expected shard count from reporting rows", async () => {
    await publish("gw-a", [sample(0), sample(1)]);
    await publish("gw-b", [sample(2, { shardCount: 4 })]);

    const snapshot = await readClusterShards({ redis, clusterName: CLUSTER });

    expect(snapshot.shardCount).toBe(4);
    expect(snapshot.missingShardIds).toEqual([3]);
    expect(snapshot.shards.map((s) => s.shardId)).toEqual([0, 1, 2]);

    const gwA = snapshot.replicas.find((r) => r.replicaId === "gw-a");
    expect(gwA).toMatchObject({ reportingShardIds: [0, 1] });
    const gwB = snapshot.replicas.find((r) => r.replicaId === "gw-b");
    expect(gwB).toMatchObject({ reportingShardIds: [2] });
  });

  it("returns an empty topology when nothing has ever reported", async () => {
    const snapshot = await readClusterShards({ redis, clusterName: CLUSTER });

    expect(snapshot.shardCount).toBe(0);
    expect(snapshot.shards).toEqual([]);
    expect(snapshot.replicas).toEqual([]);
    expect(snapshot.missingShardIds).toEqual([]);
  });

  it("scans every master instead of one node on Cluster", async () => {
    const key0 = `lumi:cluster:${CLUSTER}:shard:0`;
    const key1 = `lumi:cluster:${CLUSTER}:shard:1`;
    const row = (shardId: number) =>
      JSON.stringify({ ...sample(shardId), replicaId: "gw-a", updatedAt: 1 });
    const cluster = {
      nodes: vi.fn(() => [
        { scan: vi.fn(async () => ["0", [key0]]) },
        { scan: vi.fn(async () => ["0", [key1]]) },
      ]),
      get: vi.fn(async (key: string) =>
        key === key0 ? row(0) : key === key1 ? row(1) : null,
      ),
      set: vi.fn(async () => "OK"),
      del: vi.fn(async () => 1),
    } as any;

    const snapshot = await readClusterShards({ redis: cluster, clusterName: CLUSTER });

    expect(cluster.nodes).toHaveBeenCalledWith("master");
    expect(snapshot.shards.map((s) => s.shardId)).toEqual([0, 1]);
  });
});
