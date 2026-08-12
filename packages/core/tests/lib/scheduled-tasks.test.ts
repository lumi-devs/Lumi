import { describe, it, expect, vi, beforeEach } from "vitest";
import { container } from "@sapphire/framework";
import { shouldRunNow, RelayTask } from "#lib/scheduled-tasks.js";
import { registerTaskFireHandler } from "#lib/task-fire-registry.js";

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
  });

  it("looks up the registered handler by task name and calls it in-process", async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    registerTaskFireHandler("relay-test-task" as any, handler);

    const fakeTask = { name: "relay-test-task" };
    await RelayTask.prototype.run.call(fakeTask, { foo: "bar" } as any);

    expect(handler).toHaveBeenCalledWith({ foo: "bar" });
  });

  it("defaults a nullish payload to an empty object before dispatch", async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    registerTaskFireHandler("relay-test-task-empty" as any, handler);

    const fakeTask = { name: "relay-test-task-empty" };
    await RelayTask.prototype.run.call(fakeTask, undefined as any);

    expect(handler).toHaveBeenCalledWith({});
  });

  it("warns and no-ops when no handler is registered for the task", async () => {
    const fakeTask = { name: "relay-test-task-unregistered" };
    await RelayTask.prototype.run.call(fakeTask, {} as any);

    expect(container.logger.warn).toHaveBeenCalledWith(
      "[RelayTask] Fire for 'relay-test-task-unregistered' has no registered handler (module unloaded?).",
    );
  });
});
