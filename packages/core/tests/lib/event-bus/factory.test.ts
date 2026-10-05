import { describe, it, expect, vi, beforeEach } from "bun:test";
import { createEventBus } from "#lib/event-bus/factory.js";
import { StreamBus } from "#lib/event-bus/StreamBus.js";

const mockQuit = vi.fn().mockResolvedValue("OK");
const mockInstances: any[] = [];

vi.mock("iovalkey", () => {
  class MockValkey {
    opts: any;
    xadd = vi.fn().mockResolvedValue("1-0");
    xack = vi.fn().mockResolvedValue(1);
    xlen = vi.fn().mockResolvedValue(0);
    xgroup = vi.fn().mockResolvedValue("OK");
    xreadgroup = vi.fn().mockResolvedValue(null);
    xautoclaim = vi.fn().mockResolvedValue(null);
    xpending = vi.fn().mockResolvedValue([]);
    quit = mockQuit;
    constructor(opts: any) {
      this.opts = opts;
      mockInstances.push(this);
    }
  }
  return { Valkey: MockValkey, default: MockValkey };
});

describe("createEventBus", () => {
  beforeEach(() => {
    mockInstances.length = 0;
    mockQuit.mockClear();
  });
  it("throws error when valkey options are missing", () => {
    expect(() => createEventBus()).toThrow(
      "createEventBus(): `valkey` options required",
    );
    expect(() => createEventBus({} as any)).toThrow(
      "createEventBus(): `valkey` options required",
    );
  });

  it("initializes OwnedEventBus with StreamBus and dedicated Valkey connections", () => {
    mockInstances.length = 0;
    const onStatsSpy = vi.fn();
    const logSpy = vi.fn();

    const owned = createEventBus({
      valkey: { host: "localhost", port: 6379 },
      defaultMaxLen: 50000,
      maxDeliveries: 3,
      claimMinIdleMs: 45000,
      claimIntervalMs: 15000,
      onStats: onStatsSpy,
      statsIntervalMs: 5000,
      log: logSpy,
    });

    expect(owned.bus).toBeInstanceOf(StreamBus);
    expect(owned.publisher).toBeDefined();

    expect(mockInstances).toHaveLength(2);
    expect(mockInstances[0].opts).toEqual(
      expect.objectContaining({
        host: "localhost",
        port: 6379,
        lazyConnect: true,
      }),
    );
    expect(mockInstances[1].opts).toEqual(
      expect.objectContaining({
        host: "localhost",
        port: 6379,
        lazyConnect: true,
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
      }),
    );

    const bus = owned.bus as any;
    expect(bus.defaultMaxLen).toBe(50000);
    expect(bus.maxDeliveries).toBe(3);
    expect(bus.claimMinIdleMs).toBe(45000);
    expect(bus.claimIntervalMs).toBe(15000);
    expect(bus.statsIntervalMs).toBe(5000);
  });

  it("passes claimMinIdleMs through to the bus", () => {
    const owned = createEventBus({
      valkey: { host: "localhost" },
      claimMinIdleMs: 30000,
    });

    const bus = owned.bus as any;
    expect(bus.claimMinIdleMs).toBe(30000);
  });

  it("closes both the bus and Valkey clients when close() is invoked", async () => {
    mockQuit.mockClear();
    const owned = createEventBus({
      valkey: { host: "localhost", port: 6379 },
    });

    const busCloseSpy = vi.spyOn(owned.bus, "close");

    await owned.close();

    expect(busCloseSpy).toHaveBeenCalledTimes(1);
    expect(mockQuit).toHaveBeenCalledTimes(2);
  });
});
