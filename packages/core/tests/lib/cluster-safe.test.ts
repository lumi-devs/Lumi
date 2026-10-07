import { describe, expect, it, vi } from "bun:test";
import calculateSlot from "cluster-key-slot";
import {
  delSafe,
  mgetSafe,
  pipelineBySlot,
  scanKeysSafe,
} from "@lumi/infrastructure/database";
import type { ValkeyClient } from "@lumi/infrastructure/database";

// A stand-in for iovalkey' Cluster: every multi-key call asserts that all its
// keys share a slot, which is exactly what a real cluster enforces.

// isCluster() uses instanceof, so a fake is treated as standalone. These tests
// therefore exercise the standalone path plus the grouping logic directly.
const asClient = (c: unknown) => c as ValkeyClient;

describe("mgetSafe", () => {
  it("returns values in the order the keys were given", async () => {
    const valkey = {
      mget: vi.fn().mockResolvedValue(["a", null, "c"]),
    };
    const out = await mgetSafe(asClient(valkey), ["k1", "k2", "k3"]);
    expect(out).toEqual(["a", null, "c"]);
  });

  it("issues no call for an empty key list", async () => {
    const valkey = { mget: vi.fn() };
    expect(await mgetSafe(asClient(valkey), [])).toEqual([]);
    expect(valkey.mget).not.toHaveBeenCalled();
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
    const valkey = { pipeline: () => chain };

    await pipelineBySlot(asClient(valkey), ["a", "b", "c"], (k) => k, (p, k) => {
      (p as unknown as typeof chain).set(k);
    });

    expect(applied).toEqual(["a", "b", "c"]);
    expect(chain.exec).toHaveBeenCalledTimes(1);
  });

  it("does nothing for an empty list", async () => {
    const valkey = { pipeline: vi.fn() };
    await pipelineBySlot(asClient(valkey), [], (k: string) => k, () => {});
    expect(valkey.pipeline).not.toHaveBeenCalled();
  });

  it("throws instead of silently dropping a failed pipeline", async () => {
    const failure = new Error("READONLY replica");
    const chain = {
      set: (_key: string) => chain,
      exec: vi.fn().mockResolvedValue([[failure, null]]),
    };
    const valkey = { pipeline: () => chain };

    await expect(
      pipelineBySlot(asClient(valkey), ["a"], (k) => k, (p) => {
        (p as unknown as typeof chain).set("a");
      }),
    ).rejects.toBe(failure);
  });
});

describe("scanKeysSafe", () => {
  it("walks the cursor to completion", async () => {
    const valkey = {
      scan: vi
        .fn()
        .mockResolvedValueOnce(["7", ["k1", "k2"]])
        .mockResolvedValueOnce(["0", ["k3"]]),
    };
    expect(await scanKeysSafe(asClient(valkey), "lumi:*")).toEqual(["k1", "k2", "k3"]);
    expect(valkey.scan).toHaveBeenCalledTimes(2);
  });
});

describe("delSafe", () => {
  it("skips the call entirely when there is nothing to delete", async () => {
    const valkey = { del: vi.fn() };
    await delSafe(asClient(valkey), []);
    expect(valkey.del).not.toHaveBeenCalled();
  });
});
