import { describe, it, expect, vi, beforeEach } from "vitest";
import { ClusterReadyTracker } from "../src/cluster-ready.js";

describe("ClusterReadyTracker", () => {
  let mockRedis: any;

  beforeEach(() => {
    const store = new Map<string, string>();
    mockRedis = {
      set: vi.fn(async (key: string, val: string) => {
        store.set(key, val);
        return "OK";
      }),
      get: vi.fn(async (key: string) => store.get(key) ?? null),
    };
  });

  it("publishes ready state true and returns isReady true", async () => {
    const tracker = new ClusterReadyTracker({
      redis: mockRedis,
      clusterName: "default",
    });

    expect(await tracker.isReady()).toBe(false);

    await tracker.publishReady(true);
    expect(mockRedis.set).toHaveBeenCalledWith("lumi:cluster:default:ready", "1", "PX", 30000);
    expect(await tracker.isReady()).toBe(true);
  });

  it("publishes ready state false", async () => {
    const tracker = new ClusterReadyTracker({
      redis: mockRedis,
      clusterName: "production",
      ttlMs: 15000,
    });

    await tracker.publishReady(false);
    expect(mockRedis.set).toHaveBeenCalledWith("lumi:cluster:production:ready", "0", "PX", 15000);
    expect(await tracker.isReady()).toBe(false);
  });

  it("waitForReady resolves immediately when cluster is ready", async () => {
    const tracker = new ClusterReadyTracker({
      redis: mockRedis,
      clusterName: "default",
    });

    await tracker.publishReady(true);
    await expect(tracker.waitForReady()).resolves.toBeUndefined();
  });
});
