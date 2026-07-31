import { describe, it, expect, vi } from "vitest";
import {
  RawGatewayConsumer,
  DEFAULT_RAW_DISPATCH_TYPES,
} from "../src/RawGatewayConsumer.js";
import { RAW_GATEWAY_CONSUMER_GROUP } from "@lumi/contracts";
import type { BusMessage, EventBus } from "../src/types.js";

describe("RawGatewayConsumer", () => {
  const createMockBus = (
    consumeHandlerCapture?: (msg: BusMessage<unknown>) => Promise<void>,
  ): { bus: EventBus; stopSpy: ReturnType<typeof vi.fn> } => {
    const stopSpy = vi.fn().mockResolvedValue(undefined);
    const bus: EventBus = {
      publish: vi.fn().mockResolvedValue("1-0"),
      consume: vi.fn().mockImplementation((_streams, _opts, handler) => {
        if (consumeHandlerCapture) {
          // store handler reference
          (consumeHandlerCapture as any).handler = handler;
        }
        return stopSpy;
      }),
      close: vi.fn().mockResolvedValue(undefined),
    };
    return { bus, stopSpy };
  };

  const createMockClient = () => ({
    ws: {
      handlePacket: vi.fn().mockReturnValue(true),
    },
  });

  it("starts consuming default dispatch types with canonical consumer group", async () => {
    const captureContainer = {} as any;
    const { bus } = createMockBus(captureContainer);
    const client = createMockClient();

    const consumer = new RawGatewayConsumer(bus, client, {
      consumerId: "worker-1",
      blockMs: 2000,
      batchSize: 10,
    });

    await consumer.start();

    expect(bus.consume).toHaveBeenCalledTimes(1);
    const [streams, opts] = (bus.consume as ReturnType<typeof vi.fn>).mock
      .calls[0];

    expect(streams).toHaveLength(DEFAULT_RAW_DISPATCH_TYPES.length);
    expect(streams).toContain("lumi:gw:message_create");
    expect(streams).toContain("lumi:gw:guild_create");

    expect(opts).toEqual({
      group: RAW_GATEWAY_CONSUMER_GROUP,
      consumer: "worker-1",
      blockMs: 2000,
      batchSize: 10,
    });
  });

  it("supports custom dispatch types and custom group name", async () => {
    const { bus } = createMockBus();
    const client = createMockClient();

    const consumer = new RawGatewayConsumer(bus, client, {
      consumerId: "worker-custom",
      dispatchTypes: ["MESSAGE_CREATE"],
      group: "custom-group",
    });

    await consumer.start();

    const [streams, opts] = (bus.consume as ReturnType<typeof vi.fn>).mock
      .calls[0];

    expect(streams).toEqual(["lumi:gw:message_create"]);
    expect(opts.group).toEqual("custom-group");
  });

  it("processes stream messages, handles packets, and acknowledges messages", async () => {
    const capture = {} as any;
    const { bus } = createMockBus(capture);
    const client = createMockClient();

    const consumer = new RawGatewayConsumer(bus, client, {
      consumerId: "worker-1",
    });

    await consumer.start();
    const handler = capture.handler;

    const mockAck = vi.fn().mockResolvedValue(undefined);
    const mockNack = vi.fn().mockResolvedValue(undefined);

    const msg: BusMessage<any> = {
      id: "100-0",
      body: {
        shardId: 2,
        packet: { op: 0, t: "MESSAGE_CREATE", d: { id: "m-1" } },
        ts: Date.now(),
        guildId: "g-1",
        traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
        tracestate: "rojo=1",
      },
      deliveryCount: 1,
      ack: mockAck,
      nack: mockNack,
    };

    await handler(msg);

    expect(client.ws.handlePacket).toHaveBeenCalledWith(
      { op: 0, t: "MESSAGE_CREATE", d: { id: "m-1" } },
      expect.objectContaining({ id: 2 }),
    );
    expect(mockAck).toHaveBeenCalledTimes(1);
  });

  it("handles messages without traceparent using default trace context", async () => {
    const capture = {} as any;
    const { bus } = createMockBus(capture);
    const client = createMockClient();

    const consumer = new RawGatewayConsumer(bus, client, {
      consumerId: "worker-1",
    });

    await consumer.start();
    const handler = capture.handler;

    const mockAck = vi.fn().mockResolvedValue(undefined);

    const msg: BusMessage<any> = {
      id: "101-0",
      body: {
        shardId: 0,
        packet: { op: 0, t: "GUILD_CREATE", d: { id: "g-2" } },
        ts: Date.now(),
      },
      deliveryCount: 1,
      ack: mockAck,
      nack: vi.fn(),
    };

    await handler(msg);

    expect(client.ws.handlePacket).toHaveBeenCalledWith(
      { op: 0, t: "GUILD_CREATE", d: { id: "g-2" } },
      expect.objectContaining({ id: 0 }),
    );
    expect(mockAck).toHaveBeenCalledTimes(1);
  });

  it("catches handler errors, logs failure, and leaves message unacked", async () => {
    const capture = {} as any;
    const { bus } = createMockBus(capture);
    const client = createMockClient();
    client.ws.handlePacket.mockImplementation(() => {
      throw new Error("Discord.js packet parsing failure");
    });

    const logSpy = vi.fn();
    const consumer = new RawGatewayConsumer(bus, client, {
      consumerId: "worker-1",
      log: logSpy,
    });

    await consumer.start();
    const handler = capture.handler;

    const mockAck = vi.fn().mockResolvedValue(undefined);

    const msg: BusMessage<any> = {
      id: "102-0",
      body: {
        shardId: 0,
        packet: { op: 0, t: "MESSAGE_CREATE" },
        ts: Date.now(),
      },
      deliveryCount: 1,
      ack: mockAck,
      nack: vi.fn(),
    };

    await expect(handler(msg)).resolves.not.toThrow();

    expect(mockAck).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(
      "error",
      "raw-gateway dispatch failed",
      expect.objectContaining({
        id: "102-0",
        t: "MESSAGE_CREATE",
        err: "Error: Discord.js packet parsing failure",
      }),
    );
  });

  it("stops consuming when stopConsuming is invoked", async () => {
    const { bus, stopSpy } = createMockBus();
    const client = createMockClient();

    const consumer = new RawGatewayConsumer(bus, client, {
      consumerId: "worker-1",
    });

    await consumer.start();
    await consumer.stopConsuming();

    expect(stopSpy).toHaveBeenCalledTimes(1);

    // Calling stopConsuming again is a no-op
    await consumer.stopConsuming();
    expect(stopSpy).toHaveBeenCalledTimes(1);
  });
});
