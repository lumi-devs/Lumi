import { describe, it, expect, vi } from "bun:test";
import {
  scopedEventBus,
  detachScopedBus,
} from "#src/lib/event-bus/ScopedBus.js";

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
