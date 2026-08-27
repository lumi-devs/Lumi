import { describe, expect, it, vi } from "vitest";
import calculateSlot from "cluster-key-slot";
import {
  delSafe,
  mgetSafe,
  pipelineBySlot,
  scanKeysSafe,
} from "../../src/lib/database/cluster-safe.js";
import type { RedisClient } from "../../src/lib/database/cluster-safe.js";

// A stand-in for ioredis' Cluster: every multi-key call asserts that all its
// keys share a slot, which is exactly what a real cluster enforces.
class FakeCluster {
  public readonly mgetCalls: string[][] = [];
  public readonly delCalls: string[][] = [];
  public constructor(private readonly store: Map<string, string>) {}

  #assertSameSlot(keys: string[]) {
    const slots = new Set(keys.map((k) => calculateSlot(k)));
    if (slots.size > 1) throw new Error("CROSSSLOT Keys don't hash to the same slot");
  }

  mget(...keys: string[]) {
    this.#assertSameSlot(keys);
    this.mgetCalls.push(keys);
    return Promise.resolve(keys.map((k) => this.store.get(k) ?? null));
  }

  del(...keys: string[]) {
    this.#assertSameSlot(keys);
    this.delCalls.push(keys);
    return Promise.resolve(keys.length);
  }

  pipeline() {
    const keys: string[] = [];
    const chain = {
      set: (k: string) => { keys.push(k); return chain; },
      exec: () => { this.#assertSameSlot(keys); return Promise.resolve([]); },
    };
    return chain;
  }

  nodes() { return []; }
}

// isCluster() uses instanceof, so a fake is treated as standalone. These tests
// therefore exercise the standalone path plus the grouping logic directly.
const asClient = (c: unknown) => c as unknown as RedisClient;

describe("mgetSafe", () => {
  it("returns values in the order the keys were given", async () => {
    const redis = {
      mget: vi.fn().mockResolvedValue(["a", null, "c"]),
    };
    const out = await mgetSafe(asClient(redis), ["k1", "k2", "k3"]);
    expect(out).toEqual(["a", null, "c"]);
  });

  it("issues no call for an empty key list", async () => {
    const redis = { mget: vi.fn() };
    expect(await mgetSafe(asClient(redis), [])).toEqual([]);
    expect(redis.mget).not.toHaveBeenCalled();
  });
});

describe("cross-slot grouping", () => {
  // The whole point: keys that hash apart must never share one command.
  it("keys used together on the hot path really do span slots", () => {
    const globalKey = "lumi:module:global:filter";
    const guildKey = "lumi:module:filter:123456789012345678";
    expect(calculateSlot(globalKey)).not.toBe(calculateSlot(guildKey));
  });

  it("a hash tag forces colocation", () => {
    expect(calculateSlot("lumi:ignore:guild:{99}")).toBe(
      calculateSlot("lumi:ignore:channel:{99}:5"),
    );
  });
});

describe("pipelineBySlot", () => {
  it("applies every item exactly once on standalone", async () => {
    const applied: string[] = [];
    const chain = { set: (k: string) => { applied.push(k); return chain; }, exec: vi.fn().mockResolvedValue([]) };
    const redis = { pipeline: () => chain };

    await pipelineBySlot(asClient(redis), ["a", "b", "c"], (k) => k, (p, k) => {
      (p as unknown as typeof chain).set(k);
    });

    expect(applied).toEqual(["a", "b", "c"]);
    expect(chain.exec).toHaveBeenCalledOnce();
  });

  it("does nothing for an empty list", async () => {
    const redis = { pipeline: vi.fn() };
    await pipelineBySlot(asClient(redis), [], (k: string) => k, () => {});
    expect(redis.pipeline).not.toHaveBeenCalled();
  });
});

describe("scanKeysSafe", () => {
  it("walks the cursor to completion", async () => {
    const redis = {
      scan: vi
        .fn()
        .mockResolvedValueOnce(["7", ["k1", "k2"]])
        .mockResolvedValueOnce(["0", ["k3"]]),
    };
    expect(await scanKeysSafe(asClient(redis), "lumi:*")).toEqual(["k1", "k2", "k3"]);
    expect(redis.scan).toHaveBeenCalledTimes(2);
  });
});

describe("delSafe", () => {
  it("skips the call entirely when there is nothing to delete", async () => {
    const redis = { del: vi.fn() };
    await delSafe(asClient(redis), []);
    expect(redis.del).not.toHaveBeenCalled();
  });
});
