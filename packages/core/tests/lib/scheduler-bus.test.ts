import { describe, it, expect, vi, beforeEach } from "vitest";
import { container } from "@sapphire/framework";
import { taskFireStream, publishTaskFire } from "#lib/scheduler-bus.js";

describe("scheduler-bus", () => {
  beforeEach(() => {
    (container as any).eventBus = {
      publish: vi.fn().mockResolvedValue(undefined),
    } as any;
  });

  it("taskFireStream returns formatted stream name", () => {
    expect(taskFireStream("test-task")).toBe("lumi.scheduler.fire:test-task");
  });

  it("publishTaskFire publishes FireEnvelope to task fire stream", async () => {
    await publishTaskFire("fire-task" as any, { data: 42 });

    expect(container.eventBus.publish).toHaveBeenCalledWith(
      "lumi.scheduler.fire:fire-task",
      expect.objectContaining({
        name: "fire-task",
        payload: { data: 42 },
      })
    );
  });
});
