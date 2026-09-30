import { describe, expect, it } from "bun:test";
import {
  mapWithConcurrency,
  Semaphore,
  SemaphoreQueueFullError,
} from "../../../src/lib/utilities/concurrency.js";

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

describe("Semaphore", () => {
  it("lets up to maxConcurrency callers run at once", async () => {
    const sem = new Semaphore(2);
    let inFlight = 0;
    let peak = 0;

    await Promise.all(
      Array.from({ length: 6 }, () =>
        sem.run(async () => {
          inFlight++;
          peak = Math.max(peak, inFlight);
          await tick();
          inFlight--;
        }),
      ),
    );

    expect(peak).toBeLessThanOrEqual(2);
    expect(peak).toBeGreaterThan(1);
  });

  it("queues the N+1th caller until a permit is released", async () => {
    const sem = new Semaphore(1);
    const order: string[] = [];

    let releaseFirst!: () => void;
    const first = sem.run(async () => {
      order.push("first-start");
      await new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
      order.push("first-end");
    });

    await tick();
    expect(sem.inFlight).toBe(1);
    expect(sem.queued).toBe(0);

    const second = sem.run(async () => {
      order.push("second-start");
    });

    await tick();
    expect(sem.queued).toBe(1);
    expect(order).toEqual(["first-start"]);

    releaseFirst();
    await Promise.all([first, second]);

    expect(order).toEqual(["first-start", "first-end", "second-start"]);
    expect(sem.inFlight).toBe(0);
    expect(sem.queued).toBe(0);
  });

  it("rejects with SemaphoreQueueFullError once the queue is at maxQueueLength", async () => {
    const sem = new Semaphore(1, { name: "test-sem", maxQueueLength: 1 });

    let releaseFirst!: () => void;
    const first = sem.run(
      () =>
        new Promise<void>((resolve) => {
          releaseFirst = resolve;
        }),
    );
    await tick();

    // Fills the one queue slot.
    const second = sem.run(async () => {});
    await tick();

    // The queue is now full - this caller must reject rather than wait.
    await expect(sem.run(async () => {})).rejects.toBeInstanceOf(SemaphoreQueueFullError);

    releaseFirst();
    await Promise.all([first, second]);
  });

  it("releases the permit even when the wrapped function throws", async () => {
    const sem = new Semaphore(1);

    await expect(
      sem.run(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(sem.inFlight).toBe(0);
    // A second call must be able to acquire immediately.
    await expect(sem.run(async () => "ok")).resolves.toBe("ok");
  });
});
