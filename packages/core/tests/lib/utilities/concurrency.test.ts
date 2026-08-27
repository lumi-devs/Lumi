import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "../../../src/lib/utilities/concurrency.js";

const tick = () => new Promise((r) => setTimeout(r, 1));

describe("mapWithConcurrency", () => {
  it("visits every item exactly once", async () => {
    const items = Array.from({ length: 50 }, (_, i) => i);
    const seen: number[] = [];

    await mapWithConcurrency(items, 10, async (n) => {
      await tick();
      seen.push(n);
    });

    expect(seen).toHaveLength(items.length);
    expect([...seen].sort((a, b) => a - b)).toEqual(items);
  });

  it("never exceeds the limit in flight", async () => {
    let inFlight = 0;
    let peak = 0;

    await mapWithConcurrency(Array.from({ length: 40 }, (_, i) => i), 5, async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await tick();
      inFlight--;
    });

    expect(peak).toBeLessThanOrEqual(5);
    expect(peak).toBeGreaterThan(1);
  });

  it("handles an empty list and a limit above the item count", async () => {
    await expect(mapWithConcurrency([], 10, async () => {})).resolves.toBeUndefined();

    const seen: number[] = [];
    await mapWithConcurrency([1, 2], 99, async (n) => {
      seen.push(n);
    });
    expect(seen).toHaveLength(2);
  });
});
