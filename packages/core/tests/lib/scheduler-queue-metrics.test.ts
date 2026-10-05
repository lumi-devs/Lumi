import { describe, it, expect, vi, beforeEach } from "bun:test";
import { container } from "@sapphire/framework";
import { scheduledJobsGauge } from "@lumi/observability";
import { watchQueueDepth } from "#lib/scheduler-queue-metrics.js";

describe("scheduler-queue-metrics", () => {
  beforeEach(() => {
    (container as any).logger = { warn: vi.fn() };
  });

  it("samples job counts by state onto lumi_scheduled_jobs", async () => {
    const getJobCounts = vi.fn().mockResolvedValue({
      waiting: 3,
      delayed: 1,
      active: 2,
      failed: 0,
      prioritized: 5,
    });
    const fakeHandler = { client: { getJobCounts } } as any;

    const watcher = watchQueueDepth(fakeHandler);
    await Promise.resolve();
    await Promise.resolve();

    expect(getJobCounts).toHaveBeenCalledWith(
      "waiting",
      "delayed",
      "active",
      "failed",
      "prioritized",
    );

    const metric = await scheduledJobsGauge.get();
    const valueFor = (state: string) =>
      metric.values.find((v) => v.labels["state"] === state)?.value;

    expect(valueFor("waiting")).toBe(3);
    expect(valueFor("delayed")).toBe(1);
    expect(valueFor("active")).toBe(2);
    expect(valueFor("failed")).toBe(0);
    expect(valueFor("prioritized")).toBe(5);

    await watcher.close();
  });

  it("warns instead of throwing when the queue read fails", async () => {
    const getJobCounts = vi.fn().mockRejectedValue(new Error("valkey down"));
    const fakeHandler = { client: { getJobCounts } } as any;

    const watcher = watchQueueDepth(fakeHandler);
    await Promise.resolve();
    await Promise.resolve();

    expect(container.logger.warn).toHaveBeenCalled();

    await watcher.close();
  });
});
