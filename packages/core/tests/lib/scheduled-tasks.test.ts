import { describe, it, expect, vi, beforeEach } from "vitest";
import { container } from "@sapphire/framework";
import { shouldRunNow, RelayTask } from "#lib/scheduled-tasks.js";
import { taskFireStream } from "#lib/scheduler-bus.js";

describe("shouldRunNow", () => {
  it("runs when no payload is given", () => {
    expect(shouldRunNow("task")).toBe(true);
  });

  it("runs when catchUp is not explicitly false", () => {
    expect(shouldRunNow("task", { scheduledFor: Date.now() - 1_000_000 })).toBe(
      true,
    );
  });

  it("runs when catchUp is false but within the grace window", () => {
    expect(
      shouldRunNow(
        "task",
        { catchUp: false, scheduledFor: Date.now() - 1_000 },
        60_000,
      ),
    ).toBe(true);
  });

  it("drops overdue catchUp:false jobs beyond the grace window", () => {
    container.logger = { debug: vi.fn() } as any;
    expect(
      shouldRunNow(
        "task",
        { catchUp: false, scheduledFor: Date.now() - 100_000 },
        60_000,
      ),
    ).toBe(false);
    expect(container.logger.debug).toHaveBeenCalled();
  });
});

describe("RelayTask.run", () => {
  beforeEach(() => {
    container.logger = { debug: vi.fn(), warn: vi.fn() } as any;
    (container as any).eventBus = { publish: vi.fn().mockResolvedValue(undefined) } as any;
  });

  it("publishes the fire onto the task's stream with the given payload", async () => {
    const fakeTask = { name: "relay-test-task" };
    await RelayTask.prototype.run.call(fakeTask, { foo: "bar" } as any);

    expect(container.eventBus.publish).toHaveBeenCalledWith(
      taskFireStream("relay-test-task"),
      expect.objectContaining({ name: "relay-test-task", payload: { foo: "bar" } }),
    );
  });

  it("defaults a nullish payload to an empty object before publishing", async () => {
    const fakeTask = { name: "relay-test-task-empty" };
    await RelayTask.prototype.run.call(fakeTask, undefined as any);

    expect(container.eventBus.publish).toHaveBeenCalledWith(
      taskFireStream("relay-test-task-empty"),
      expect.objectContaining({ payload: {} }),
    );
  });

  it("does not publish when the catch-up policy says to drop the job", async () => {
    const fakeTask = { name: "relay-test-task-dropped" };
    await RelayTask.prototype.run.call(fakeTask, {
      catchUp: false,
      scheduledFor: Date.now() - 100_000,
    } as any);

    expect(container.eventBus.publish).not.toHaveBeenCalled();
  });
});
