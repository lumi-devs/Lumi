import { describe, it, expect, vi, beforeEach } from "bun:test";
import { container } from "@sapphire/framework";
import { scheduleTask, QueuePriority } from "#lib/schedule-task.js";

describe("schedule-task", () => {
  beforeEach(() => {
    (container as any).tasks = {
      create: vi.fn().mockResolvedValue(undefined),
    };
  });

  it("forwards customJobOptions.priority verbatim to container.tasks.create", async () => {
    await scheduleTask(
      "mod-lift" as any,
      { caseId: 1 },
      {
        repeated: false,
        delay: 1000,
        customJobOptions: { priority: QueuePriority.CRITICAL },
      },
    );

    expect(container.tasks.create).toHaveBeenCalledTimes(1);
    const [, options] = (container.tasks.create as any).mock.calls[0];
    expect(options.customJobOptions.priority).toBe(QueuePriority.CRITICAL);
  });

  it("leaves priority unset when the caller does not pass one", async () => {
    await scheduleTask("send-message" as any, { channelId: "c1" });

    const [, options] = (container.tasks.create as any).mock.calls[0];
    expect(options).toBeUndefined();
  });

  it("defines QueuePriority so CRITICAL sorts before UTILITY before CLEANUP", () => {
    expect(QueuePriority.CRITICAL).toBeLessThan(QueuePriority.UTILITY);
    expect(QueuePriority.UTILITY).toBeLessThan(QueuePriority.CLEANUP);
  });
});
