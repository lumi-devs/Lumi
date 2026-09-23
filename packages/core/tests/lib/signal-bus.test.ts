import { describe, it, expect, vi, beforeEach } from "bun:test";
import { container } from "@sapphire/framework";
import { SignalBus } from "#lib/database/redis.js";

const CHANNEL = "lumi:signals";

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
    removeListener: vi.fn((event: string) => {
      handlers.delete(event);
    }),
    emit: (event: string, ...args: any[]) => handlers.get(event)?.(...args),
    hasHandler: (event: string) => handlers.has(event),
  };
}

describe("SignalBus", () => {
  let subscriber: ReturnType<typeof createMockSubscriber>;
  let bus: SignalBus;

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
    bus = new SignalBus(subscriber as any);
  });

  describe("publish", () => {
    it("publishes a JSON-encoded topic/payload/time envelope, no delete", async () => {
      await bus.publish("tempvc", { kind: "vcadd", g: "1", c: "2" });

      expect((container.redis as any).del).not.toHaveBeenCalled();

      const [channel, message] = (container.redis.publish as any).mock
        .calls[0];
      expect(channel).toBe(CHANNEL);
      const parsed = JSON.parse(message);
      expect(parsed.topic).toBe("tempvc");
      expect(parsed.payload).toEqual({ kind: "vcadd", g: "1", c: "2" });
      expect(typeof parsed.time).toBe("number");
    });

    it("never calls delSafe/del as part of publishing", async () => {
      await bus.publish("reactionroles", { kind: "menusreload", g: "1" });

      expect((container.redis as any).del).not.toHaveBeenCalled();
    });
  });

  describe("start", () => {
    it("subscribes to the signals channel", async () => {
      await bus.start();

      expect(subscriber.subscribe).toHaveBeenCalledWith(CHANNEL);
      expect(subscriber.hasHandler("message")).toBe(true);
    });

    it("subscribes only once across repeated starts", async () => {
      await bus.start();
      await bus.start();

      expect(subscriber.subscribe).toHaveBeenCalledTimes(1);
    });
  });

  describe("incoming signals", () => {
    beforeEach(async () => {
      await bus.start();
    });

    it("delivers a published message to a registered listener with topic and payload split out", () => {
      const listener = vi.fn();
      bus.onSignal(listener);

      subscriber.emit(
        "message",
        CHANNEL,
        JSON.stringify({
          topic: "tempvc",
          payload: { kind: "vcadd", g: "1", c: "2" },
          time: Date.now(),
        }),
      );

      expect(listener).toHaveBeenCalledWith("tempvc", {
        kind: "vcadd",
        g: "1",
        c: "2",
      });
    });

    it("stops notifying a listener once it unsubscribes", () => {
      const listener = vi.fn();
      const off = bus.onSignal(listener);
      off();

      subscriber.emit(
        "message",
        CHANNEL,
        JSON.stringify({
          topic: "tempvc",
          payload: { kind: "vcdel" },
          time: Date.now(),
        }),
      );

      expect(listener).not.toHaveBeenCalled();
    });

    it("ignores a payload that is not valid JSON", () => {
      const listener = vi.fn();
      bus.onSignal(listener);

      subscriber.emit("message", CHANNEL, "{not json");

      expect(listener).not.toHaveBeenCalled();
    });

    it("ignores a message missing a string topic", () => {
      const listener = vi.fn();
      bus.onSignal(listener);

      subscriber.emit(
        "message",
        CHANNEL,
        JSON.stringify({ payload: { kind: "vcadd" }, time: Date.now() }),
      );

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("teardown", () => {
    it("unsubscribes on stop", async () => {
      await bus.start();
      await bus.stop();

      expect(subscriber.unsubscribe).toHaveBeenCalledWith(CHANNEL);
    });

    it("quits the owned connection on close", async () => {
      await bus.start();
      await bus.close();

      expect(subscriber.unsubscribe).toHaveBeenCalled();
      expect(subscriber.removeListener).toHaveBeenCalledWith(
        "message",
        expect.any(Function),
      );
      expect(subscriber.quit).toHaveBeenCalled();
    });
  });
});
