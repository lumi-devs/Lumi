import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RedisStreamsBus } from "../src/RedisStreamsBus.js";
import type { Redis } from "ioredis";

describe("RedisStreamsBus", () => {
  let publisherMock: any;
  let subscriberMock: any;
  let logSpy: any;

  beforeEach(() => {
    vi.useFakeTimers();
    logSpy = vi.fn();

    publisherMock = {
      xadd: vi.fn().mockResolvedValue("1718550000000-0"),
      xack: vi.fn().mockResolvedValue(1),
      xlen: vi.fn().mockResolvedValue(5),
      xgroup: vi.fn().mockResolvedValue("OK"),
      xpending: vi.fn().mockResolvedValue([12, "100-0", "100-0", []]),
      xautoclaim: vi.fn().mockResolvedValue(null),
      quit: vi.fn().mockResolvedValue("OK"),
    };

    subscriberMock = {
      xreadgroup: vi.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(null), 50)),
      ),
      xautoclaim: vi.fn().mockResolvedValue(null),
      xpending: vi.fn().mockResolvedValue([12, "100-0", "100-0", []]),
      quit: vi.fn().mockResolvedValue("OK"),
      disconnect: vi.fn(),
    };
    // duplicate() returns itself so existing assertions still see the calls.
    subscriberMock.duplicate = vi.fn().mockReturnValue(subscriberMock);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const createBus = (opts = {}) => {
    return new RedisStreamsBus({
      publisher: publisherMock,
      subscriber: subscriberMock,
      log: logSpy,
      claimIntervalMs: 0,
      statsIntervalMs: 0,
      ...opts,
    });
  };

  const stopAndFlush = async (stopFn: () => Promise<void>) => {
    const promise = stopFn();
    await vi.advanceTimersByTimeAsync(100);
    await promise;
  };

  describe("publish", () => {
    it("publishes JSON-encoded message to Redis stream with MAXLEN ~ cap", async () => {
      const bus = createBus({ defaultMaxLen: 5000 });
      const id = await bus.publish("test-stream", { hello: "world" });

      expect(id).toBe("1718550000000-0");
      expect(publisherMock.xadd).toHaveBeenCalledWith(
        "test-stream",
        "MAXLEN",
        "~",
        "5000",
        "*",
        "b",
        JSON.stringify({ hello: "world" }),
      );
    });

    it("uses custom maxLen override when provided", async () => {
      const bus = createBus({ defaultMaxLen: 5000 });
      await bus.publish("test-stream", { data: 123 }, { maxLen: 100 });

      expect(publisherMock.xadd).toHaveBeenCalledWith(
        "test-stream",
        "MAXLEN",
        "~",
        "100",
        "*",
        "b",
        JSON.stringify({ data: 123 }),
      );
    });

    it("throws error if bus is closed", async () => {
      const bus = createBus();
      await bus.close();

      await expect(bus.publish("test-stream", {})).rejects.toThrow(
        "RedisStreamsBus closed",
      );
    });

    it("throws error if xadd returns null", async () => {
      publisherMock.xadd.mockResolvedValueOnce(null);
      const bus = createBus();

      await expect(bus.publish("test-stream", {})).rejects.toThrow(
        "XADD on test-stream returned null",
      );
    });
  });

  describe("ensureGroup & consume", () => {
    it("creates consumer group lazily on ensureGroup", async () => {
      const bus = createBus();

      const stop = await bus.consume(
        ["stream-1"],
        { group: "group-1", consumer: "c-1", blockMs: 10 },
        async () => {},
      );

      expect(publisherMock.xgroup).toHaveBeenCalledWith(
        "CREATE",
        "stream-1",
        "group-1",
        "0",
        "MKSTREAM",
      );

      await stopAndFlush(stop);
    });

    it("ignores BUSYGROUP error if consumer group already exists", async () => {
      publisherMock.xgroup.mockRejectedValueOnce(
        new Error("BUSYGROUP Consumer Group name already exists"),
      );
      const bus = createBus();

      const stop = await bus.consume(
        ["stream-1"],
        { group: "group-1", consumer: "c-1" },
        async () => {},
      );

      expect(publisherMock.xgroup).toHaveBeenCalledTimes(1);

      // Caches existing groups, second consume does not re-call xgroup
      const stop2 = await bus.consume(
        ["stream-1"],
        { group: "group-1", consumer: "c-1" },
        async () => {},
      );
      expect(publisherMock.xgroup).toHaveBeenCalledTimes(1);

      await stopAndFlush(stop);
      await stopAndFlush(stop2);
    });

    it("defaults a new group to start at stream position 0 (full history)", async () => {
      const bus = createBus();
      const stop = await bus.consume(
        ["stream-1"],
        { group: "group-1", consumer: "c-1" },
        async () => {},
      );
      expect(publisherMock.xgroup).toHaveBeenCalledWith(
        "CREATE",
        "stream-1",
        "group-1",
        "0",
        "MKSTREAM",
      );
      await stopAndFlush(stop);
    });

    it("honors startId '$' for a group that should only see new entries", async () => {
      // Regression: broadcast-mode groups are one-shot per replica and must
      // not replay the entire stream history to a fresh consumer group
      // minted on every ordinary restart.
      const bus = createBus();
      const stop = await bus.consume(
        ["stream-1"],
        { group: "broadcast-group", consumer: "c-1", startId: "$" },
        async () => {},
      );
      expect(publisherMock.xgroup).toHaveBeenCalledWith(
        "CREATE",
        "stream-1",
        "broadcast-group",
        "$",
        "MKSTREAM",
      );
      await stopAndFlush(stop);
    });

    it("rethrows non-BUSYGROUP error from xgroup", async () => {
      publisherMock.xgroup.mockRejectedValueOnce(
        new Error("NOPERM User has no permissions"),
      );
      const bus = createBus();

      await expect(
        bus.consume(["stream-1"], { group: "group-1", consumer: "c-1" }, async () => {}),
      ).rejects.toThrow("NOPERM User has no permissions");
    });

    it("reads messages from stream, decodes body, and passes BusMessage to handler", async () => {
      const bus = createBus();
      const handlerSpy = vi.fn().mockImplementation(async (msg) => {
        await msg.ack();
        await msg.nack();
      });

      subscriberMock.xreadgroup
        .mockImplementationOnce(
          () => [
            [
              "stream-1",
              [
                [
                  "1000-0",
                  ["b", JSON.stringify({ payload: "test-data" })],
                ],
              ],
            ],
          ],
        );

      const stop = await bus.consume(
        ["stream-1"],
        { group: "g-1", consumer: "c-1", blockMs: 10 },
        handlerSpy,
      );

      await vi.advanceTimersByTimeAsync(100);

      expect(handlerSpy).toHaveBeenCalledTimes(1);
      const msg = handlerSpy.mock.calls[0][0];
      expect(msg.id).toBe("1000-0");
      expect(msg.body).toEqual({ payload: "test-data" });
      expect(msg.deliveryCount).toBe(1);

      expect(publisherMock.xack).toHaveBeenCalledWith("stream-1", "g-1", "1000-0");

      await stopAndFlush(stop);
    });

    it("handles xreadgroup error gracefully and retries after sleep", async () => {
      const bus = createBus();
      subscriberMock.xreadgroup.mockImplementationOnce(
        () => { throw new Error("Socket error"); },
      );

      const stop = await bus.consume(
        ["stream-1"],
        { group: "g-1", consumer: "c-1", blockMs: 10 },
        async () => {},
      );

      await vi.advanceTimersByTimeAsync(600);

      expect(logSpy).toHaveBeenCalledWith(
        "error",
        "xreadgroup failed",
        expect.objectContaining({ err: "Error: Socket error" }),
      );

      await stopAndFlush(stop);
    });
  });

  describe("deliver & error handling / DLQ", () => {
    it("logs error when handler throws and leaves entry pending", async () => {
      const bus = createBus();
      subscriberMock.xreadgroup.mockImplementationOnce(
        () => [
          [
            "stream-1",
            [["2000-0", ["b", JSON.stringify({ key: "val" })]]],
          ],
        ],
      );

      const failingHandler = vi.fn().mockRejectedValue(new Error("Handler crash"));

      const stop = await bus.consume(
        ["stream-1"],
        { group: "g-1", consumer: "c-1" },
        failingHandler,
      );

      await vi.advanceTimersByTimeAsync(100);

      expect(logSpy).toHaveBeenCalledWith(
        "error",
        "handler threw; leaving entry pending",
        expect.objectContaining({
          stream: "stream-1",
          id: "2000-0",
          deliveryCount: 1,
          err: "Error: Handler crash",
        }),
      );

      expect(publisherMock.xack).not.toHaveBeenCalled();

      await stopAndFlush(stop);
    });

    it("routes message to DLQ and acks when deliveryCount > maxDeliveries", async () => {
      const bus = createBus({ maxDeliveries: 3, defaultMaxLen: 10000 });
      const handlerSpy = vi.fn();

      publisherMock.xautoclaim.mockResolvedValueOnce([
        "0-0",
        [["3000-0", ["b", JSON.stringify({ poison: true })]]],
        [],
      ]);

      publisherMock.xpending.mockResolvedValueOnce([
        ["3000-0", "worker-1", 70000, 4],
      ]);

      await (bus as any).runClaim(["stream-1"], { group: "g-1", consumer: "c-1" }, handlerSpy);

      expect(handlerSpy).not.toHaveBeenCalled();
      expect(publisherMock.xadd).toHaveBeenCalledWith(
        "stream-1:dlq",
        "MAXLEN",
        "~",
        "10000",
        "*",
        "b",
        JSON.stringify({ poison: true }),
        "src_id",
        "3000-0",
        "src_stream",
        "stream-1",
        "delivery_count",
        "4",
        "dead_at",
        expect.any(String),
      );
      expect(publisherMock.xack).toHaveBeenCalledWith("stream-1", "g-1", "3000-0");
      expect(logSpy).toHaveBeenCalledWith(
        "warn",
        "dropped poison message to DLQ",
        expect.objectContaining({
          stream: "stream-1",
          id: "3000-0",
          deliveryCount: 4,
        }),
      );
    });

    it("routes message missing b field to DLQ and acks without throwing", async () => {
      const bus = createBus();
      const handlerSpy = vi.fn();

      await (bus as any).deliver(
        "stream-1",
        "g-1",
        "4000-0",
        ["other_field", "value"],
        1,
        handlerSpy,
      );

      expect(handlerSpy).not.toHaveBeenCalled();
      expect(publisherMock.xadd).toHaveBeenCalledWith(
        "stream-1:dlq",
        expect.anything(),
        expect.anything(),
        expect.anything(),
        "*",
        "b",
        "value",
        "src_id",
        "4000-0",
        "src_stream",
        "stream-1",
        "delivery_count",
        "1",
        "dead_at",
        expect.any(String),
      );
      expect(publisherMock.xack).toHaveBeenCalledWith("stream-1", "g-1", "4000-0");
      expect(logSpy).toHaveBeenCalledWith(
        "error",
        "malformed payload JSON or missing fields",
        expect.objectContaining({
          stream: "stream-1",
          id: "4000-0",
          err: "Error: RedisStreamsBus: message missing `b` field",
        }),
      );
    });

    it("does not ack a poison message if the DLQ write itself fails", async () => {
      // Regression: acking here would remove the entry from the pending list
      // while it was never durably recorded anywhere - permanent, silent
      // message loss. Must stay pending so XAUTOCLAIM retries the DLQ write.
      const bus = createBus({ maxDeliveries: 3 });
      const handlerSpy = vi.fn();
      publisherMock.xadd.mockRejectedValueOnce(new Error("DLQ write failed"));

      await (bus as any).deliver(
        "stream-1",
        "g-1",
        "5000-0",
        ["b", JSON.stringify({ poison: true })],
        4,
        handlerSpy,
      );

      expect(handlerSpy).not.toHaveBeenCalled();
      expect(publisherMock.xack).not.toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalledWith(
        "error",
        "sendToDlq failed; leaving entry pending for retry",
        expect.objectContaining({ stream: "stream-1", id: "5000-0" }),
      );
    });

    it("does not ack a malformed message if the DLQ write itself fails", async () => {
      const bus = createBus();
      const handlerSpy = vi.fn();
      publisherMock.xadd.mockRejectedValueOnce(new Error("DLQ write failed"));

      await (bus as any).deliver(
        "stream-1",
        "g-1",
        "6000-0",
        ["other_field", "value"],
        1,
        handlerSpy,
      );

      expect(handlerSpy).not.toHaveBeenCalled();
      expect(publisherMock.xack).not.toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalledWith(
        "error",
        "sendToDlq failed; leaving entry pending for retry",
        expect.objectContaining({ stream: "stream-1", id: "6000-0" }),
      );
    });

    it("handles malformed JSON message without crashing consumer read loop", async () => {
      const bus = createBus();
      const handlerSpy = vi.fn();

      subscriberMock.xreadgroup
        .mockImplementationOnce(() => [
          [
            "stream-1",
            [
              [
                "1000-0",
                ["b", "{ invalid json"],
              ],
            ],
          ],
        ])
        .mockImplementationOnce(() => [
          [
            "stream-1",
            [
              [
                "1001-0",
                ["b", JSON.stringify({ ok: true })],
              ],
            ],
          ],
        ]);

      const stop = await bus.consume(
        ["stream-1"],
        { group: "g-1", consumer: "c-1", blockMs: 10 },
        handlerSpy,
      );

      await vi.advanceTimersByTimeAsync(200);

      expect(publisherMock.xadd).toHaveBeenCalledWith(
        "stream-1:dlq",
        expect.anything(),
        expect.anything(),
        expect.anything(),
        "*",
        "b",
        "{ invalid json",
        "src_id",
        "1000-0",
        "src_stream",
        "stream-1",
        "delivery_count",
        "1",
        "dead_at",
        expect.any(String),
      );
      expect(publisherMock.xack).toHaveBeenCalledWith("stream-1", "g-1", "1000-0");

      expect(handlerSpy).toHaveBeenCalledTimes(1);
      expect(handlerSpy.mock.calls[0][0].body).toEqual({ ok: true });

      await stopAndFlush(stop);
    });

    it("stopping consumer subscription correctly clears claimTimer and statsTimer from timers set", async () => {
      const bus = createBus({ claimIntervalMs: 5000, statsIntervalMs: 5000, onStats: vi.fn() });

      const stop = await bus.consume(
        ["stream-1"],
        { group: "g-1", consumer: "c-1" },
        async () => {},
      );

      expect((bus as any).timers.size).toBe(2);

      await stopAndFlush(stop);

      expect((bus as any).timers.size).toBe(0);
    });
  });

  describe("runClaim & XAUTOCLAIM loop", () => {
    it("runs claim loop periodically when claimIntervalMs > 0", async () => {
      const bus = createBus({ claimIntervalMs: 5000 });
      const handlerSpy = vi.fn();

      publisherMock.xautoclaim.mockResolvedValueOnce([
        "0-0",
        [["5000-0", ["b", JSON.stringify({ claimed: true })]]],
        [],
      ]);
      publisherMock.xpending.mockResolvedValueOnce([
        ["5000-0", "worker-1", 65000, 2],
      ]);

      const stop = await bus.consume(
        ["stream-1"],
        { group: "g-1", consumer: "c-1" },
        handlerSpy,
      );

      await vi.advanceTimersByTimeAsync(5000);

      expect(publisherMock.xautoclaim).toHaveBeenCalledWith(
        "stream-1",
        "g-1",
        "c-1",
        60000,
        "0-0",
        "COUNT",
        16,
      );

      expect(handlerSpy).toHaveBeenCalledTimes(1);
      const msg = handlerSpy.mock.calls[0][0];
      expect(msg.deliveryCount).toBe(2);

      await stopAndFlush(stop);
    });

    it("handles pendingDeliveryCount fallback when xpending returns null or empty", async () => {
      const bus = createBus();
      publisherMock.xpending.mockResolvedValueOnce(null);

      const countNull = await (bus as any).pendingDeliveryCount("stream-1", "g-1", "id-1");
      expect(countNull).toBe(1);

      publisherMock.xpending.mockResolvedValueOnce([]);
      const countEmpty = await (bus as any).pendingDeliveryCount("stream-1", "g-1", "id-1");
      expect(countEmpty).toBe(1);
    });

    it("keeps processing remaining claimed entries when pendingDeliveryCount fails for one", async () => {
      // Regression: a transient XPENDING failure for one entry must not
      // abort the rest of the claimed batch - the unguarded call used to
      // let this exception propagate out of runClaim entirely.
      const bus = createBus();
      const handlerSpy = vi.fn();

      publisherMock.xautoclaim.mockResolvedValueOnce([
        "0-0",
        [
          ["7000-0", ["b", JSON.stringify({ first: true })]],
          ["7001-0", ["b", JSON.stringify({ second: true })]],
        ],
        [],
      ]);
      publisherMock.xpending
        .mockRejectedValueOnce(new Error("XPENDING transient error"))
        .mockResolvedValueOnce([["7001-0", "worker-1", 65000, 1]]);

      await (bus as any).runClaim(["stream-1"], { group: "g-1", consumer: "c-1" }, handlerSpy);

      expect(logSpy).toHaveBeenCalledWith(
        "error",
        "pendingDeliveryCount failed",
        expect.objectContaining({ stream: "stream-1", id: "7000-0" }),
      );
      // The first entry's delivery is skipped for this tick (it'll be
      // reconsidered next cycle), but the second entry still gets delivered.
      expect(handlerSpy).toHaveBeenCalledTimes(1);
      expect(handlerSpy.mock.calls[0][0].id).toBe("7001-0");
    });

    it("logs error when xautoclaim loop throws exception", async () => {
      const bus = createBus({ claimIntervalMs: 5000 });
      publisherMock.xautoclaim.mockRejectedValueOnce(new Error("Autoclaim error"));

      const stop = await bus.consume(
        ["stream-1"],
        { group: "g-1", consumer: "c-1" },
        async () => {},
      );

      await vi.advanceTimersByTimeAsync(5000);

      expect(logSpy).toHaveBeenCalledWith(
        "error",
        "xautoclaim loop failed",
        expect.objectContaining({ err: "Error: Autoclaim error" }),
      );

      await stopAndFlush(stop);
    });
  });

  describe("runStats & periodic stats monitoring", () => {
    it("triggers onStats callback periodically with stream metrics", async () => {
      const onStatsSpy = vi.fn();
      const bus = createBus({
        onStats: onStatsSpy,
        statsIntervalMs: 2000,
      });

      publisherMock.xlen
        .mockResolvedValueOnce(25) // live stream len
        .mockResolvedValueOnce(2); // dlq stream len
      publisherMock.xpending.mockResolvedValueOnce([12, "0-0", "0-0", []]); // pending summary count

      const stop = await bus.consume(
        ["stream-1"],
        { group: "g-1", consumer: "c-1" },
        async () => {},
      );

      await vi.advanceTimersByTimeAsync(2000);

      expect(onStatsSpy).toHaveBeenCalledWith({
        stream: "stream-1",
        group: "g-1",
        length: 25,
        pending: 12,
        dlqLength: 2,
      });

      await stopAndFlush(stop);
    });

    it("handles pendingCount error and returns 0 in stats snapshot", async () => {
      const onStatsSpy = vi.fn();
      const bus = createBus({
        onStats: onStatsSpy,
        statsIntervalMs: 2000,
      });

      publisherMock.xlen.mockRejectedValue(new Error("Redis error"));
      publisherMock.xpending.mockRejectedValue(new Error("Pending error"));

      const stop = await bus.consume(
        ["stream-1"],
        { group: "g-1", consumer: "c-1" },
        async () => {},
      );

      await vi.advanceTimersByTimeAsync(2000);

      expect(onStatsSpy).toHaveBeenCalledWith({
        stream: "stream-1",
        group: "g-1",
        length: 0,
        pending: 0,
        dlqLength: 0,
      });

      await stopAndFlush(stop);
    });

    it("logs error when stats loop rejects", async () => {
      const onStatsSpy = vi.fn().mockImplementation(() => {
        throw new Error("Stats listener failed");
      });
      const bus = createBus({
        onStats: onStatsSpy,
        statsIntervalMs: 2000,
      });

      const stop = await bus.consume(
        ["stream-1"],
        { group: "g-1", consumer: "c-1" },
        async () => {},
      );

      await vi.advanceTimersByTimeAsync(2000);

      expect(logSpy).toHaveBeenCalledWith(
        "error",
        "stats loop failed",
        expect.objectContaining({ err: "Error: Stats listener failed" }),
      );

      await stopAndFlush(stop);
    });
  });

  describe("close", () => {
    it("clears timers and sets closed state", async () => {
      const bus = createBus({ claimIntervalMs: 1000, statsIntervalMs: 1000 });
      await bus.close();

      expect((bus as any).closed).toBe(true);
      expect((bus as any).timers.size).toBe(0);
    });
  });
});
