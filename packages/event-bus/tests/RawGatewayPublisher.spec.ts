import { describe, it, expect, vi } from "vitest";
import {
  RawGatewayPublisher,
  attachProxyPublisher,
} from "../src/RawGatewayPublisher.js";
import type { EventBus } from "../src/types.js";

describe("RawGatewayPublisher", () => {
  const createMockBus = (): EventBus => ({
    publish: vi.fn().mockResolvedValue("1718550000000-0"),
    consume: vi.fn().mockResolvedValue(async () => {}),
    close: vi.fn().mockResolvedValue(undefined),
  });

  const createMockClient = (impl?: (p: unknown, s: { id: number }) => boolean) => ({
    ws: {
      handlePacket: impl ?? vi.fn().mockReturnValue(true),
    },
  });

  it("attaches to handlePacket and forwards op=0 dispatch packets to the bus", async () => {
    const bus = createMockBus();
    const client = createMockClient();
    const publisher = new RawGatewayPublisher(bus, client, { maxLen: 5000 });

    publisher.attach();

    const packet = {
      op: 0,
      t: "MESSAGE_CREATE",
      d: { guild_id: "g-123", content: "hello" },
    };
    const shard = { id: 1 };

    const result = client.ws.handlePacket(packet, shard);
    expect(result).toBe(true);

    expect(bus.publish).toHaveBeenCalledTimes(1);
    expect(bus.publish).toHaveBeenCalledWith(
      "lumi:gw:message_create",
      expect.objectContaining({
        shardId: 1,
        packet,
        guildId: "g-123",
      }),
      { maxLen: 5000 },
    );
  });

  it("is idempotent when calling attach multiple times", () => {
    const bus = createMockBus();
    const client = createMockClient();
    const publisher = new RawGatewayPublisher(bus, client);

    publisher.attach();
    const wrappedFn = client.ws.handlePacket;
    publisher.attach();
    expect(client.ws.handlePacket).toBe(wrappedFn);
  });

  it("ignores non-dispatch or ignored dispatch types", () => {
    const bus = createMockBus();
    const client = createMockClient();
    const publisher = new RawGatewayPublisher(bus, client, {
      ignoreDispatchTypes: new Set(["PRESENCE_UPDATE"]),
    });

    publisher.attach();

    // Op 1 (Heartbeat)
    client.ws.handlePacket({ op: 1 }, { id: 0 });
    // Op 0 with missing t
    client.ws.handlePacket({ op: 0 }, { id: 0 });
    // Op 0 with ignored t
    client.ws.handlePacket(
      { op: 0, t: "PRESENCE_UPDATE", d: { guild_id: "123" } },
      { id: 0 },
    );

    expect(bus.publish).not.toHaveBeenCalled();
  });

  it("extracts guildId correctly across different payload formats", () => {
    const bus = createMockBus();
    const client = createMockClient();
    const publisher = new RawGatewayPublisher(bus, client);

    publisher.attach();

    // d is null
    (bus.publish as ReturnType<typeof vi.fn>).mockClear();
    client.ws.handlePacket({ op: 0, t: "READY", d: null }, { id: 0 });
    expect(bus.publish).toHaveBeenCalledTimes(1);
    expect(bus.publish).toHaveBeenLastCalledWith(
      "lumi:gw:ready",
      expect.objectContaining({ guildId: undefined }),
      { maxLen: undefined },
    );

    // d is non-object
    (bus.publish as ReturnType<typeof vi.fn>).mockClear();
    client.ws.handlePacket({ op: 0, t: "READY", d: "string-d" }, { id: 0 });
    expect(bus.publish).toHaveBeenCalledTimes(1);
    expect(bus.publish).toHaveBeenLastCalledWith(
      "lumi:gw:ready",
      expect.objectContaining({ guildId: undefined }),
      { maxLen: undefined },
    );

    // guild_id is not a string
    (bus.publish as ReturnType<typeof vi.fn>).mockClear();
    client.ws.handlePacket(
      { op: 0, t: "READY", d: { guild_id: 12345 } },
      { id: 0 },
    );
    expect(bus.publish).toHaveBeenCalledTimes(1);
    expect(bus.publish).toHaveBeenLastCalledWith(
      "lumi:gw:ready",
      expect.objectContaining({ guildId: undefined }),
      { maxLen: undefined },
    );
  });

  it("safely handles non-string p.t values without throwing", () => {
    const bus = createMockBus();
    const client = createMockClient();
    const publisher = new RawGatewayPublisher(bus, client);

    publisher.attach();

    // p.t is a number
    expect(() =>
      client.ws.handlePacket({ op: 0, t: 12345 as any, d: {} }, { id: 0 }),
    ).not.toThrow();

    // p.t is an object
    expect(() =>
      client.ws.handlePacket({ op: 0, t: { name: "TEST" } as any, d: {} }, { id: 0 }),
    ).not.toThrow();

    // p.t is a boolean
    expect(() =>
      client.ws.handlePacket({ op: 0, t: true as any, d: {} }, { id: 0 }),
    ).not.toThrow();

    expect(bus.publish).not.toHaveBeenCalled();
  });

  it("logs error when bus.publish rejects", async () => {
    const bus = createMockBus();
    const logSpy = vi.fn();
    (bus.publish as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Redis connection dropped"),
    );

    const client = createMockClient();
    const publisher = new RawGatewayPublisher(bus, client, {
      log: logSpy,
    });

    publisher.attach();
    client.ws.handlePacket(
      { op: 0, t: "MESSAGE_CREATE", d: { guild_id: "1" } },
      { id: 0 },
    );

    await new Promise((r) => setTimeout(r, 10));

    expect(logSpy).toHaveBeenCalledWith(
      "error",
      "raw-gateway publish failed",
      expect.objectContaining({
        stream: "lumi:gw:message_create",
        err: "Error: Redis connection dropped",
      }),
    );
  });

  it("handles default log fallback when bus.publish rejects", async () => {
    const bus = createMockBus();
    (bus.publish as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Fail without logger"),
    );

    const client = createMockClient();
    const publisher = new RawGatewayPublisher(bus, client);

    publisher.attach();
    expect(() =>
      client.ws.handlePacket(
        { op: 0, t: "MESSAGE_CREATE", d: { guild_id: "1" } },
        { id: 0 },
      ),
    ).not.toThrow();

    await new Promise((r) => setTimeout(r, 10));
  });

  it("detaches original handlePacket correctly", () => {
    const originalHandlePacket = vi.fn().mockReturnValue(true);
    const client = { ws: { handlePacket: originalHandlePacket } };
    const bus = createMockBus();
    const publisher = new RawGatewayPublisher(bus, client);

    publisher.attach();
    expect(client.ws.handlePacket).not.toBe(originalHandlePacket);

    publisher.detach();
    client.ws.handlePacket(
      { op: 0, t: "MESSAGE_CREATE", d: { guild_id: "1" } },
      { id: 0 },
    );

    expect(originalHandlePacket).toHaveBeenCalledTimes(1);
    expect(bus.publish).not.toHaveBeenCalled();

    // Subsequent detach is no-op
    publisher.detach();
  });
});

describe("attachProxyPublisher", () => {
  const createMockBus = (): EventBus => ({
    publish: vi.fn().mockResolvedValue("1718550000000-0"),
    consume: vi.fn().mockResolvedValue(async () => {}),
    close: vi.fn().mockResolvedValue(undefined),
  });

  const createMockEmitter = () => {
    const listeners: Record<string, Array<Function>> = {};
    return {
      listeners,
      on: vi.fn((event: string, fn: Function) => {
        listeners[event] = listeners[event] || [];
        listeners[event].push(fn);
      }),
      off: vi.fn((event: string, fn: Function) => {
        if (listeners[event]) {
          listeners[event] = listeners[event].filter((f) => f !== fn);
        }
      }),
      emit: (event: string, data: unknown, shardId: number) => {
        if (listeners[event]) {
          for (const fn of listeners[event]) {
            fn(data, shardId);
          }
        }
      },
    };
  };

  it("attaches dispatch listener to proxy manager and publishes events", () => {
    const bus = createMockBus();
    const emitter = createMockEmitter();

    const cleanup = attachProxyPublisher(bus, emitter, { maxLen: 1000 });
    expect(emitter.on).toHaveBeenCalledWith("dispatch", expect.any(Function));

    const packet = { op: 0, t: "GUILD_CREATE", d: { guild_id: "g-999" } };
    emitter.emit("dispatch", packet, 3);

    expect(bus.publish).toHaveBeenCalledWith(
      "lumi:gw:guild_create",
      expect.objectContaining({
        shardId: 3,
        packet,
        guildId: "g-999",
      }),
      { maxLen: 1000 },
    );

    cleanup();
    expect(emitter.off).toHaveBeenCalledWith("dispatch", expect.any(Function));
  });

  it("supports custom dispatch event name and ignores specified types", () => {
    const bus = createMockBus();
    const emitter = createMockEmitter();

    attachProxyPublisher(bus, emitter, {
      dispatchEvent: "custom_dispatch",
      ignoreDispatchTypes: new Set(["TYPING_START"]),
    });

    expect(emitter.on).toHaveBeenCalledWith("custom_dispatch", expect.any(Function));

    // Missing t
    emitter.emit("custom_dispatch", { op: 0 } as any, 0);
    // Ignored type
    emitter.emit("custom_dispatch", { op: 0, t: "TYPING_START" }, 0);

    expect(bus.publish).not.toHaveBeenCalled();
  });

  it("handles publish error and logger fallback", async () => {
    const bus = createMockBus();
    const logSpy = vi.fn();
    (bus.publish as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Proxy publish error"),
    );

    const emitter = createMockEmitter();
    attachProxyPublisher(bus, emitter, { log: logSpy });

    emitter.emit(
      "dispatch",
      { op: 0, t: "INTERACTION_CREATE", d: { guild_id: "g-1" } },
      0,
    );

    await new Promise((r) => setTimeout(r, 10));

    expect(logSpy).toHaveBeenCalledWith(
      "error",
      "raw-gateway publish failed",
      expect.objectContaining({
        stream: "lumi:gw:interaction_create",
        err: "Error: Proxy publish error",
      }),
    );
  });

  it("safely handles non-string data.t values without throwing", () => {
    const bus = createMockBus();
    const emitter = createMockEmitter();

    attachProxyPublisher(bus, emitter);

    expect(() =>
      emitter.emit("dispatch", { op: 0, t: 12345 as any } as any, 0),
    ).not.toThrow();

    expect(bus.publish).not.toHaveBeenCalled();
  });
});
