import { describe, expect, it, vi } from "vitest";
import { warmCache, warmCacheParallel } from "../src/cache-warmer.js";

describe("CacheWarmer", () => {
  it("warms cache with sequential batches", async () => {
    const keys = ["key1", "key2", "key3"];
    const loader = vi.fn().mockImplementation(async (batch: readonly string[]) => {
      const map = new Map<string, string>();
      for (const k of batch) {
        map.set(k, `value-${k}`);
      }
      return map;
    });

    const result = await warmCache({
      keys,
      loader,
      batchSize: 2,
    });

    expect(result.loaded).toBe(3);
    expect(result.failed.length).toBe(0);
    expect(result.results.get("key1")).toBe("value-key1");
    expect(result.results.get("key2")).toBe("value-key2");
    expect(result.results.get("key3")).toBe("value-key3");
  });

  it("handles loader failures gracefully", async () => {
    const keys = ["key1", "failKey"];
    const loader = vi.fn().mockImplementation(async (batch: readonly string[]) => {
      const map = new Map<string, string>();
      for (const k of batch) {
        if (k === "failKey") {
          throw new Error("Load failed");
        }
        map.set(k, `val-${k}`);
      }
      return map;
    });

    const result = await warmCache({
      keys,
      loader,
      batchSize: 1,
    });

    expect(result.loaded).toBe(1);
    expect(result.failed).toContain("failKey");
    expect(result.results.has("key1")).toBe(true);
  });

  it("calls onProgress callback", async () => {
    const keys = ["k1", "k2"];
    const progressCalls: [number, number][] = [];
    const loader = vi.fn().mockImplementation(async (batch: readonly string[]) => {
      const map = new Map<string, string>();
      for (const k of batch) map.set(k, "v");
      return map;
    });

    await warmCache({
      keys,
      loader,
      batchSize: 1,
      onProgress: (loaded, total) => progressCalls.push([loaded, total]),
    });

    expect(progressCalls.length).toBe(2);
    expect(progressCalls[0]).toEqual([1, 2]);
    expect(progressCalls[1]).toEqual([2, 2]);
  });

  it("warms cache in parallel with semaphore concurrency", async () => {
    const keys = ["k1", "k2", "k3"];
    const loader = vi.fn().mockImplementation(async (batch: readonly string[]) => {
      const map = new Map<string, string>();
      for (const k of batch) map.set(k, `parallel-${k}`);
      return map;
    });

    const result = await warmCacheParallel({
      keys,
      loader,
      concurrency: 2,
    });

    expect(result.loaded).toBe(3);
    expect(result.failed.length).toBe(0);
    expect(result.results.get("k1")).toBe("parallel-k1");
  });
});