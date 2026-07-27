import { describe, it, expect, vi, beforeEach } from "vitest";
import { createEventBus } from "../src/factory.js";
import { RedisStreamsBus } from "../src/RedisStreamsBus.js";

const mockQuit = vi.fn().mockResolvedValue("OK");
const mockInstances: any[] = [];

vi.mock("ioredis", () => {
  class MockRedis {
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
  return { Redis: MockRedis, default: MockRedis };
});

describe("createEventBus", () => {
  beforeEach(() => {
    mockInstances.length = 0;
    mockQuit.mockClear();
  });
  it("throws error when redis options are missing", () => {
    expect(() => createEventBus()).toThrow(
      "createEventBus(): `redis` options required",
    );
    expect(() => createEventBus({} as any)).toThrow(
      "createEventBus(): `redis` options required",
    );
  });

  it("initializes OwnedEventBus with RedisStreamsBus and dedicated ioredis connections", () => {
    mockInstances.length = 0;
    const onStatsSpy = vi.fn();
    const logSpy = vi.fn();

    const owned = createEventBus({
      transport: "streams",
      redis: { host: "localhost", port: 6379 },
      defaultMaxLen: 50000,
      maxDeliveries: 3,
      ackWaitMs: 45000, // tests legacy alias fallback
      claimIntervalMs: 15000,
      onStats: onStatsSpy,
      statsIntervalMs: 5000,
      log: logSpy,
    });

    expect(owned.transport).toBe("streams");
    expect(owned.bus).toBeInstanceOf(RedisStreamsBus);
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

  it("uses claimMinIdleMs over ackWaitMs when both provided", () => {
    const owned = createEventBus({
      redis: { host: "localhost" },
      claimMinIdleMs: 30000,
      ackWaitMs: 45000,
    });

    const bus = owned.bus as any;
    expect(bus.claimMinIdleMs).toBe(30000);
  });

  it("closes both the bus and Redis clients when close() is invoked", async () => {
    mockQuit.mockClear();
    const owned = createEventBus({
      redis: { host: "localhost", port: 6379 },
    });

    const busCloseSpy = vi.spyOn(owned.bus, "close");

    await owned.close();

    expect(busCloseSpy).toHaveBeenCalledTimes(1);
    expect(mockQuit).toHaveBeenCalledTimes(2);
  });
});
