import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RedisStreamsBus } from "@lumi/event-bus";

describe("Chaos Suite: Redis Stream Poison Pill & DLQ Routing", () => {
  let publisher: any;
  let subscriber: any;
  let eventBus: RedisStreamsBus;

  beforeEach(() => {
    vi.clearAllMocks();
    publisher = {
      xadd: vi.fn().mockResolvedValue("1600000000000-0"),
      xack: vi.fn().mockResolvedValue(1),
      xgroup: vi.fn().mockResolvedValue("OK"),
      xpending: vi.fn().mockResolvedValue([[null, null, null, 1]]),
      xautoclaim: vi.fn().mockResolvedValue(["0-0", []]),
      xlen: vi.fn().mockResolvedValue(0),
    };
    const readConn = {
      xreadgroup: vi.fn(),
      quit: vi.fn().mockResolvedValue("OK"),
      disconnect: vi.fn(),
    };
    subscriber = {
      duplicate: vi.fn().mockReturnValue(readConn),
    };
    eventBus = new RedisStreamsBus({
      publisher,
      subscriber,
      claimIntervalMs: 0,
    });
  });

  afterEach(async () => {
    await eventBus.close();
  });

  it("safely diverts malformed/unparseable JSON stream events to DLQ without crashing", async () => {
    const rawCorruptedPayload = "{ invalid json payload ::: 123";
    const streamName = "events:task:fire";
    const messageId = "1600000000001-0";

    const readConn = subscriber.duplicate();
    // Simulate single read cycle returning corrupted payload with 'b' field, then delayed nulls
    readConn.xreadgroup
      .mockResolvedValueOnce([
        [
          streamName,
          [[messageId, ["b", rawCorruptedPayload]]],
        ],
      ])
      .mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(null), 50)),
      );

    const handler = vi.fn().mockResolvedValue(undefined);

    const stopConsumer = await eventBus.consume(
      [streamName],
      { group: "lumi-workers", consumer: "worker-1", blockMs: 10 },
      handler,
    );

    // Give the async read loop a tick to process the message
    await new Promise((r) => setTimeout(r, 50));
    await stopConsumer();

    expect(handler).not.toHaveBeenCalled();
    expect(publisher.xadd).toHaveBeenCalledWith(
      `${streamName}:dlq`,
      "MAXLEN",
      "~",
      expect.any(String),
      "*",
      "b",
      rawCorruptedPayload,
      "src_id",
      messageId,
      "src_stream",
      streamName,
      "delivery_count",
      "1",
      "dead_at",
      expect.any(String),
    );
    expect(publisher.xack).toHaveBeenCalledWith(streamName, "lumi-workers", messageId);
  });
});
