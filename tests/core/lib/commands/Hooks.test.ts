import { describe, it, expect, vi } from "bun:test";
import {
  addBeforeInvokeHook,
  removeBeforeInvokeHook,
  runBeforeInvokeHooks,
  scopedEventBus,
  detachScopedBus,
} from "#src/lib/commands/Hooks.js";

const ctx = {} as any;

describe("beforeInvoke hooks", () => {
  it("returns null when no hooks allow and none deny", async () => {
    addBeforeInvokeHook("p6-empty-a", () => null);
    try {
      await expect(runBeforeInvokeHooks(ctx)).resolves.toBeNull();
    } finally {
      removeBeforeInvokeHook("p6-empty-a");
    }
  });

  it("returns the first denial and skips later hooks", async () => {
    const second = vi.fn().mockReturnValue(null);
    addBeforeInvokeHook("p6-first", () => ({ reason: "nope" }));
    addBeforeInvokeHook("p6-second", second);
    try {
      await expect(runBeforeInvokeHooks(ctx)).resolves.toEqual({
        reason: "nope",
      });
      expect(second).not.toHaveBeenCalled();
    } finally {
      removeBeforeInvokeHook("p6-first");
      removeBeforeInvokeHook("p6-second");
    }
  });

  it("supports async hooks and removal", async () => {
    const fn = vi.fn().mockResolvedValue(null);
    addBeforeInvokeHook("p6-async", fn);
    await expect(runBeforeInvokeHooks(ctx)).resolves.toBeNull();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(removeBeforeInvokeHook("p6-async")).toBe(true);
    expect(removeBeforeInvokeHook("p6-async")).toBe(false);
    await expect(runBeforeInvokeHooks(ctx)).resolves.toBeNull();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

function fakeServices() {
  return {
    eventBus: {
      publish: vi.fn().mockResolvedValue("9-0"),
      consume: vi.fn().mockResolvedValue(vi.fn()),
    },
  } as any;
}

describe("scopedEventBus", () => {
  it("delegates publish to the shared bus", async () => {
    const services = fakeServices();
    const bus = scopedEventBus(services, "p6-mod-a");
    await expect(bus.publish("stream", { n: 1 })).resolves.toBe("9-0");
    expect(services.eventBus.publish).toHaveBeenCalledWith("stream", {
      n: 1,
    });
    const id = await bus.publish("stream", { n: 2 }, { maxLen: 10 });
    expect(id).toBe("9-0");
    expect(services.eventBus.publish).toHaveBeenCalledWith(
      "stream",
      { n: 2 },
      { maxLen: 10 },
    );
  });

  it("tracks subscriptions and stops them on detach", async () => {
    const services = fakeServices();
    const stop = vi.fn().mockResolvedValue(undefined);
    services.eventBus.consume.mockResolvedValue(stop);
    const bus = scopedEventBus(services, "p6-mod-b");
    await bus.subscribe(["s"], { group: "g", consumer: "c" }, async () => {});
    expect(services.eventBus.consume).toHaveBeenCalledTimes(1);
    await detachScopedBus("p6-mod-b");
    expect(stop).toHaveBeenCalledTimes(1);
    await detachScopedBus("p6-mod-b");
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("detach of an unknown module is a no-op", async () => {
    await expect(
      detachScopedBus("p6-never-subscribed"),
    ).resolves.toBeUndefined();
  });
});
