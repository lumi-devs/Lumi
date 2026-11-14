import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NegativeCacheMetrics } from "../src/negative-cache.js";

describe("NegativeCacheMetrics", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calculates hit rate correctly", () => {
    const metrics = new NegativeCacheMetrics({ namespace: "test", alertThreshold: 0.8 });
    metrics.recordHit();
    metrics.recordHit();
    metrics.recordMiss();

    const snapshot = metrics.getSnapshot();
    expect(snapshot.negativeHits).toBe(2);
    expect(snapshot.negativeMisses).toBe(1);
    expect(snapshot.totalNegativeRequests).toBe(3);
    expect(snapshot.negativeHitRate).toBeCloseTo(2 / 3);
    expect(snapshot.isAlerting).toBe(false);
  });

  it("triggers alert when threshold is exceeded", () => {
    const onAlert = vi.fn();
    const metrics = new NegativeCacheMetrics({
      namespace: "test",
      alertThreshold: 0.8,
      onAlert,
    });

    // 4 hits, 1 miss = 80% -> alert
    metrics.recordHit();
    metrics.recordHit();
    metrics.recordHit();
    metrics.recordHit();
    metrics.recordMiss();

    const snapshot = metrics.getSnapshot();
    expect(snapshot.isAlerting).toBe(true);
    expect(onAlert).toHaveBeenCalledTimes(1);
  });

  it("resets metrics on window expiration", () => {
    const metrics = new NegativeCacheMetrics({
      namespace: "test",
      windowMs: 5000,
    });

    metrics.recordHit();
    expect(metrics.getSnapshot().negativeHits).toBe(1);

    vi.advanceTimersByTime(6000);

    metrics.recordMiss();
    const snapshot = metrics.getSnapshot();
    expect(snapshot.negativeMisses).toBe(1);
    expect(snapshot.negativeHits).toBe(0);
    expect(snapshot.totalNegativeRequests).toBe(1);
  });
});