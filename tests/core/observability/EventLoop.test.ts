import { afterEach, describe, expect, it } from "bun:test";
import {
  eventLoopDelay,
  startEventLoopMonitor,
  stopEventLoopMonitor,
} from "#src/observability/Index.ts";

afterEach(() => {
  stopEventLoopMonitor();
  eventLoopDelay.reset();
});

async function readGauge(): Promise<Record<string, number>> {
  const { values } = await eventLoopDelay.get();
  return Object.fromEntries(
    values.map((v) => [String(v.labels["quantile"]), v.value]),
  );
}

describe("startEventLoopMonitor", () => {
  it("reports p50, p99 and max in seconds", async () => {
    startEventLoopMonitor(20);

    const until = Date.now() + 60;
    while (Date.now() < until) {
      /* busy-wait: this is the lag we expect to observe */
    }
    await new Promise((resolve) => setTimeout(resolve, 60));

    const values = await readGauge();
    expect(Object.keys(values).sort()).toEqual(["max", "p50", "p99"]);
    for (const value of Object.values(values)) {
      expect(value).toBeGreaterThanOrEqual(0);

      expect(value).toBeLessThan(60);
    }
  });

  it("is idempotent", () => {
    const stop = startEventLoopMonitor(20);
    expect(startEventLoopMonitor(20)).toBe(stop);
    stop();
  });
});
