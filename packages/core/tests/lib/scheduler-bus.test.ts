import { describe, it, expect, vi, beforeEach } from "vitest";
import { container } from "@sapphire/framework";
import {
  SCHEDULER_REQUEST_STREAM,
  taskFireStream,
  publishCreateRequest,
  publishDeleteRequest,
  publishTaskFire,
} from "#lib/scheduler-bus.js";

describe("scheduler-bus", () => {
  beforeEach(() => {
    (container as any).eventBus = {
      publish: vi.fn().mockResolvedValue(undefined),
    } as any;
  });

  it("taskFireStream returns formatted stream name", () => {
    expect(taskFireStream("test-task")).toBe("lumi.scheduler.fire:test-task");
  });

  it("publishCreateRequest publishes CreateRequest envelope to scheduler stream", async () => {
    await publishCreateRequest("sample-task" as any, { foo: "bar" }, 5000);

    expect(container.eventBus.publish).toHaveBeenCalledWith(
      SCHEDULER_REQUEST_STREAM,
      expect.objectContaining({
        action: "create",
        name: "sample-task",
        payload: { foo: "bar" },
        options: 5000,
      })
    );
  });

  it("publishDeleteRequest publishes DeleteRequest envelope to scheduler stream", async () => {
    await publishDeleteRequest("job-123");

    expect(container.eventBus.publish).toHaveBeenCalledWith(
      SCHEDULER_REQUEST_STREAM,
      expect.objectContaining({
        action: "delete",
        jobId: "job-123",
      })
    );
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
