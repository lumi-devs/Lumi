import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { container } from "@sapphire/framework";
import { RPC_ACTIONS } from "@lumi/contracts";
import { rpcHandlers } from "#lib/rpc/dispatch.js";
import { initCoreRpcHandlers } from "#lib/rpc/core-rpc.js";

const BOT_OWNER_ID = "111111111111111111";
const INTRUDER_ID = "333333333333333333";
const CLUSTER = "prod";

function fakeRedis(store: Map<string, string>) {
  return {
    get: vi.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    mget: vi.fn((...keys: string[]) =>
      Promise.resolve(keys.map((k) => store.get(k) ?? null)),
    ),
    scan: vi.fn((_cursor: string, _match: string, pattern: string) => {
      const prefix = pattern.replace(/\\(.)/g, "$1").replace(/\*$/, "");
      return Promise.resolve([
        "0",
        [...store.keys()].filter((k) => k.startsWith(prefix)),
      ]);
    }),
  };
}

function shardRow(shardId: number, replicaId: string, updatedAt: number) {
  return JSON.stringify({
    shardId,
    replicaId,
    status: "Ready",
    ping: 37,
    guildCount: 12,
    shardCount: 3,
    updatedAt,
  });
}

describe("system.shards.get RPC handler", () => {
  let store: Map<string, string>;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env["CLUSTER_NAME"] = CLUSTER;

    store = new Map();

    container.logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as any;
    container.client = {
      application: { owner: { id: BOT_OWNER_ID } },
      guilds: { cache: new Map() },
    } as any;
    (container as any).redis = fakeRedis(store);

    initCoreRpcHandlers();
  });

  afterEach(() => {
    delete process.env["CLUSTER_NAME"];
  });

  const call = (...actor: [] | [string | undefined]) => {
    const handler = rpcHandlers.get(RPC_ACTIONS.systemShardsGet);
    if (!handler) throw new Error("system.shards.get handler not registered");
    return handler({
      id: "req",
      action: RPC_ACTIONS.systemShardsGet,
      actorId: actor.length === 0 ? BOT_OWNER_ID : actor[0],
    });
  };

  it("rejects anyone who is not a bot owner", async () => {
    await expect(call(INTRUDER_ID)).rejects.toThrow(/Bot Owner/);
    await expect(call(undefined)).rejects.toThrow(/Bot Owner/);
  });

  it("returns reporting shards with ISO timestamps", async () => {
    store.set(`lumi:cluster:${CLUSTER}:shard:0`, shardRow(0, "gw-a", Date.UTC(2026, 0, 3)));
    store.set(`lumi:cluster:${CLUSTER}:shard:1`, shardRow(1, "gw-a", Date.UTC(2026, 0, 3)));

    const result = (await call()) as any;

    expect(result.clusterName).toBe(CLUSTER);
    expect(result.shardCount).toBe(3);
    expect(result.shards).toHaveLength(2);
    expect(result.shards[0]).toMatchObject({
      shardId: 0,
      replicaId: "gw-a",
      status: "Ready",
      ping: 37,
      guildCount: 12,
      lastHeartbeatAt: "2026-01-03T00:00:00.000Z",
    });
    expect(
      result.replicas.find((r: any) => r.replicaId === "gw-a"),
    ).toMatchObject({ reportingShardIds: [0, 1] });
  });

  it("flags missing shard ids", async () => {
    store.set(`lumi:cluster:${CLUSTER}:shard:0`, shardRow(0, "gw-a", Date.UTC(2026, 0, 3)));
    store.set(`lumi:cluster:${CLUSTER}:shard:2`, shardRow(2, "gw-b", Date.UTC(2026, 0, 3)));

    const result = (await call()) as any;

    expect(result.missingShardIds).toEqual([1]);
  });

  it("defaults to the default cluster namespace when CLUSTER_NAME is unset", async () => {
    delete process.env["CLUSTER_NAME"];

    const result = (await call()) as any;

    expect(result.clusterName).toBe("default");
    expect(result.shardCount).toBe(0);
  });
});
