import { describe, it, expect, vi, beforeEach } from "vitest";
import { container } from "@sapphire/framework";
import { InvalidationBus } from "#lib/database/redis.js";

const CHANNEL = "lumi:cache:invalidate";

/** Minimal stand-in for the dedicated ioredis subscriber connection the bus owns. */
function createMockSubscriber() {
  const handlers = new Map<string, (...args: any[]) => void>();
  return {
    on: vi.fn((event: string, fn: (...args: any[]) => void) => {
      handlers.set(event, fn);
    }),
    subscribe: vi.fn().mockResolvedValue(undefined),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
    quit: vi.fn().mockResolvedValue(undefined),
    emit: (event: string, ...args: any[]) => handlers.get(event)?.(...args),
    hasHandler: (event: string) => handlers.has(event),
  };
}

describe("InvalidationBus", () => {
  let subscriber: ReturnType<typeof createMockSubscriber>;
  let bus: InvalidationBus;

  beforeEach(() => {
    vi.clearAllMocks();

    container.logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as any;

    (container as any).redis = {
      del: vi.fn().mockResolvedValue(1),
      publish: vi.fn().mockResolvedValue(1),
    };

    subscriber = createMockSubscriber();
    bus = new InvalidationBus(subscriber as any);
  });

  describe("invalidate", () => {
    it("deletes the keys locally and broadcasts them to peers", async () => {
      await bus.invalidate("lumi:cfg:mod:guild:1", "lumi:settings:guild:1");

      expect(container.redis.del).toHaveBeenCalledWith(
        "lumi:cfg:mod:guild:1",
        "lumi:settings:guild:1",
      );

      const [channel, payload] = (container.redis.publish as any).mock.calls[0];
      expect(channel).toBe(CHANNEL);
      expect(JSON.parse(payload).keys).toEqual([
        "lumi:cfg:mod:guild:1",
        "lumi:settings:guild:1",
      ]);
    });

    it("deletes before publishing so peers never read a stale local value", async () => {
      const order: string[] = [];
      (container.redis.del as any).mockImplementation(() => {
        order.push("del");
        return Promise.resolve(1);
      });
      (container.redis.publish as any).mockImplementation(() => {
        order.push("publish");
        return Promise.resolve(1);
      });

      await bus.invalidate("k");

      expect(order).toEqual(["del", "publish"]);
    });

    it("stamps the broadcast with a time so peers can order it", async () => {
      const before = Date.now();

      await bus.invalidate("k");

      const payload = JSON.parse(
        (container.redis.publish as any).mock.calls[0][1],
      );
      expect(payload.time).toBeGreaterThanOrEqual(before);
    });

    it("is a no-op when given no keys", async () => {
      await bus.invalidate();

      expect(container.redis.del).not.toHaveBeenCalled();
      expect(container.redis.publish).not.toHaveBeenCalled();
    });

    it("never rewrites a key in place", async () => {
      await bus.invalidate("lumi:cfg:mod:guild:1");

      expect((container.redis as any).set).toBeUndefined();
      expect(container.redis.del).toHaveBeenCalledTimes(1);
    });
  });

  describe("start", () => {
    it("subscribes to the invalidation channel", async () => {
      await bus.start();

      expect(subscriber.subscribe).toHaveBeenCalledWith(CHANNEL);
      expect(subscriber.hasHandler("message")).toBe(true);
    });

    it("subscribes only once across repeated starts", async () => {
      await bus.start();
      await bus.start();

      expect(subscriber.subscribe).toHaveBeenCalledTimes(1);
    });

    it("shares one in-flight start between concurrent callers", async () => {
      await Promise.all([bus.start(), bus.start(), bus.start()]);

      expect(subscriber.subscribe).toHaveBeenCalledTimes(1);
    });
  });

  describe("incoming broadcasts", () => {
    beforeEach(async () => {
      await bus.start();
    });

    it("hands the broadcast keys to every listener", () => {
      const first = vi.fn();
      const second = vi.fn();
      bus.onInvalidate(first);
      bus.onInvalidate(second);

      subscriber.emit(
        "message",
        CHANNEL,
        JSON.stringify({ keys: ["a", "b"], time: Date.now() }),
      );

      expect(first).toHaveBeenCalledWith(["a", "b"]);
      expect(second).toHaveBeenCalledWith(["a", "b"]);
    });

    it("stops notifying a listener once it unsubscribes", () => {
      const listener = vi.fn();
      const off = bus.onInvalidate(listener);
      off();

      subscriber.emit(
        "message",
        CHANNEL,
        JSON.stringify({ keys: ["a"], time: Date.now() }),
      );

      expect(listener).not.toHaveBeenCalled();
    });

    it("ignores a payload that is not valid JSON", () => {
      const listener = vi.fn();
      bus.onInvalidate(listener);

      subscriber.emit("message", CHANNEL, "{not json");

      expect(listener).not.toHaveBeenCalled();
    });

    it("ignores a payload whose keys are not an array", () => {
      const listener = vi.fn();
      bus.onInvalidate(listener);

      subscriber.emit("message", CHANNEL, JSON.stringify({ keys: "a" }));

      expect(listener).not.toHaveBeenCalled();
    });

    it("drops non-string and empty entries from the key list", () => {
      const listener = vi.fn();
      bus.onInvalidate(listener);

      subscriber.emit(
        "message",
        CHANNEL,
        JSON.stringify({ keys: ["a", "", 5, null, "b"], time: Date.now() }),
      );

      expect(listener).toHaveBeenCalledWith(["a", "b"]);
    });

    it("does not notify when every key is filtered away", () => {
      const listener = vi.fn();
      bus.onInvalidate(listener);

      subscriber.emit(
        "message",
        CHANNEL,
        JSON.stringify({ keys: ["", null], time: Date.now() }),
      );

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("resync after a dropped connection", () => {
    beforeEach(async () => {
      await bus.start();
    });

    it("replays to resync listeners once the connection comes back", () => {
      const resync = vi.fn();
      bus.onResync(resync);

      subscriber.emit("close");
      subscriber.emit("ready");

      expect(resync).toHaveBeenCalledWith(
        expect.objectContaining({ cutoff: expect.any(Number) }),
      );
    });

    it("carries the newest seen broadcast time as the resync cutoff", () => {
      const resync = vi.fn();
      bus.onResync(resync);

      subscriber.emit(
        "message",
        CHANNEL,
        JSON.stringify({ keys: ["a"], time: 5_000 }),
      );
      subscriber.emit("close");
      subscriber.emit("ready");

      expect(resync).toHaveBeenCalledWith({ cutoff: 5_000 });
    });

    it("does not move the cutoff backwards for an out-of-order broadcast", () => {
      const resync = vi.fn();
      bus.onResync(resync);

      subscriber.emit(
        "message",
        CHANNEL,
        JSON.stringify({ keys: ["a"], time: 9_000 }),
      );
      subscriber.emit(
        "message",
        CHANNEL,
        JSON.stringify({ keys: ["b"], time: 1_000 }),
      );
      subscriber.emit("close");
      subscriber.emit("ready");

      expect(resync).toHaveBeenCalledWith({ cutoff: 9_000 });
    });

    it("does not resync when the connection never dropped", () => {
      const resync = vi.fn();
      bus.onResync(resync);

      subscriber.emit("ready");

      expect(resync).not.toHaveBeenCalled();
    });

    it("resyncs only once per drop", () => {
      const resync = vi.fn();
      bus.onResync(resync);

      subscriber.emit("close");
      subscriber.emit("ready");
      subscriber.emit("ready");

      expect(resync).toHaveBeenCalledTimes(1);
    });

    it("stops notifying a resync listener once it unsubscribes", () => {
      const resync = vi.fn();
      bus.onResync(resync)();

      subscriber.emit("close");
      subscriber.emit("ready");

      expect(resync).not.toHaveBeenCalled();
    });

    it("survives a resync listener that rejects", async () => {
      bus.onResync(vi.fn().mockRejectedValue(new Error("rebuild failed")));
      const healthy = vi.fn();
      bus.onResync(healthy);

      subscriber.emit("close");
      subscriber.emit("ready");
      await Promise.resolve();

      expect(healthy).toHaveBeenCalled();
    });
  });

  describe("teardown", () => {
    it("unsubscribes on stop", async () => {
      await bus.start();
      await bus.stop();

      expect(subscriber.unsubscribe).toHaveBeenCalledWith(CHANNEL);
    });

    it("ignores a stop before any start", async () => {
      await bus.stop();

      expect(subscriber.unsubscribe).not.toHaveBeenCalled();
    });

    it("allows a restart after a stop", async () => {
      await bus.start();
      await bus.stop();
      await bus.start();

      expect(subscriber.subscribe).toHaveBeenCalledTimes(2);
    });

    it("quits the owned connection on close", async () => {
      await bus.start();
      await bus.close();

      expect(subscriber.unsubscribe).toHaveBeenCalled();
      expect(subscriber.quit).toHaveBeenCalled();
    });

    it("still quits when the unsubscribe fails", async () => {
      await bus.start();
      subscriber.unsubscribe.mockRejectedValue(new Error("connection reset"));

      await bus.close();

      expect(subscriber.quit).toHaveBeenCalled();
    });
  });
});
