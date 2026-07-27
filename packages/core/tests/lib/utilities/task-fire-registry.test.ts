import { describe, it, expect, beforeEach, vi } from "vitest";
import { container } from "@sapphire/framework";
import {
  registerTaskFireHandler,
  getRegisteredFireHandlers,
  TaskFireConsumer,
} from "#lib/task-fire-registry.js";
import type { EventBus } from "@lumi/event-bus";

describe("Task Fire Registry & Consumer", () => {
  let mockBus: any;

  beforeEach(() => {
    container.logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as any;
    vi.restoreAllMocks();

    mockBus = {
      consume: vi.fn().mockImplementation(async (_streams, _opts, _callback) => {
        return vi.fn().mockResolvedValue(undefined);
      }),
    };
  });

  describe("registerTaskFireHandler & getRegisteredFireHandlers", () => {
    it("registers a new handler and returns registered list", () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      registerTaskFireHandler("testTask1" as any, "unicast", handler);

      const handlers = getRegisteredFireHandlers();
      const registered = handlers.find((h) => h.name === ("testTask1" as any));
      expect(registered).toBeDefined();
      expect(registered?.mode).toBe("unicast");
      expect(registered?.handler).toBe(handler);
    });

    it("warns when overwriting an existing handler for the same task name", () => {
      const handler1 = vi.fn().mockResolvedValue(undefined);
      const handler2 = vi.fn().mockResolvedValue(undefined);

      registerTaskFireHandler("overwriteTask" as any, "unicast", handler1);
      registerTaskFireHandler("overwriteTask" as any, "broadcast", handler2);

      expect(container.logger.warn).toHaveBeenCalledWith(
        "[TaskFireRegistry] Overwriting handler for task 'overwriteTask'"
      );

      const registered = getRegisteredFireHandlers().find((h) => h.name === ("overwriteTask" as any));
      expect(registered?.mode).toBe("broadcast");
      expect(registered?.handler).toBe(handler2);
    });
  });

  describe("TaskFireConsumer lifecycle & consumption", () => {
    it("subscribes to registered task streams with correct unicast and broadcast groups", async () => {
      const handlerUnicast = vi.fn().mockResolvedValue(undefined);
      const handlerBroadcast = vi.fn().mockResolvedValue(undefined);

      registerTaskFireHandler("taskUnicast" as any, "unicast", handlerUnicast);
      registerTaskFireHandler("taskBroadcast" as any, "broadcast", handlerBroadcast);

      const consumer = new TaskFireConsumer(mockBus as EventBus, {
        consumerId: "consumer-node-1",
        unicastGroup: "custom-group",
        blockMs: 5000,
        batchSize: 10,
      });

      await consumer.start();

      expect(mockBus.consume).toHaveBeenCalledWith(
        ["lumi.scheduler.fire:taskUnicast"],
        expect.objectContaining({
          group: "custom-group",
          consumer: "consumer-node-1",
          blockMs: 5000,
          batchSize: 10,
        }),
        expect.any(Function)
      );

      expect(mockBus.consume).toHaveBeenCalledWith(
        ["lumi.scheduler.fire:taskBroadcast"],
        expect.objectContaining({
          group: "lumi-worker:consumer-node-1",
          consumer: "consumer-node-1",
        }),
        expect.any(Function)
      );

      await consumer.stopConsuming();
    });

    it("is idempotent when subscribe is called multiple times for the same task name", async () => {
      const consumer = new TaskFireConsumer(mockBus as EventBus, {
        consumerId: "consumer-node-dup",
      });

      const reg = { name: "dupTask" as any, mode: "unicast" as const, handler: vi.fn() };
      await consumer.subscribe(reg);
      const callCount = mockBus.consume.mock.calls.length;

      await consumer.subscribe(reg);
      expect(mockBus.consume.mock.calls.length).toBe(callCount);

      await consumer.stopConsuming();
    });

    it("handles late registration when an active consumer is running", async () => {
      const consumer = new TaskFireConsumer(mockBus as EventBus, {
        consumerId: "active-consumer",
      });
      await consumer.start();

      mockBus.consume.mockClear();

      const lateHandler = vi.fn().mockResolvedValue(undefined);
      registerTaskFireHandler("lateTask" as any, "unicast", lateHandler);

      expect(mockBus.consume).toHaveBeenCalledWith(
        ["lumi.scheduler.fire:lateTask"],
        expect.objectContaining({
          consumer: "active-consumer",
        }),
        expect.any(Function)
      );

      await consumer.stopConsuming();
    });

    it("logs error if late subscription throws an exception", async () => {
      const consumer = new TaskFireConsumer(mockBus as EventBus, {
        consumerId: "active-consumer-fail",
      });
      await consumer.start();

      mockBus.consume.mockRejectedValueOnce(new Error("Bus subscription error"));

      registerTaskFireHandler("failLateTask" as any, "unicast", vi.fn());

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(container.logger.error).toHaveBeenCalledWith(
        "[TaskFireRegistry] Late subscribe for 'failLateTask' failed:",
        expect.any(Error)
      );

      await consumer.stopConsuming();
    });

    it("executes handler successfully and acks message upon receiving bus event", async () => {
      let consumeCallback: Function | undefined;
      mockBus.consume.mockImplementation(async (_streams: any, _opts: any, cb: Function) => {
        if (_streams[0] === "lumi.scheduler.fire:eventTask") {
          consumeCallback = cb;
        }
        return vi.fn().mockResolvedValue(undefined);
      });

      const handler = vi.fn().mockResolvedValue(undefined);
      registerTaskFireHandler("eventTask" as any, "unicast", handler);

      const consumer = new TaskFireConsumer(mockBus as EventBus, {
        consumerId: "worker-event",
      });
      await consumer.start();

      expect(consumeCallback).toBeDefined();

      const mockMsg = {
        id: "msg-101",
        deliveryCount: 1,
        body: {
          traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
          tracestate: "",
          payload: { foo: "bar" },
        },
        ack: vi.fn().mockResolvedValue(undefined),
        nack: vi.fn().mockResolvedValue(undefined),
      };

      await consumeCallback!(mockMsg);

      expect(handler).toHaveBeenCalledWith({ foo: "bar" });
      expect(mockMsg.ack).toHaveBeenCalled();
      expect(mockMsg.nack).not.toHaveBeenCalled();

      await consumer.stopConsuming();
    });

    it("acks message and logs warning when message arrives for unregistered or missing task", async () => {
      let consumeCallback: Function | undefined;
      mockBus.consume.mockImplementation(async (_streams: any, _opts: any, cb: Function) => {
        consumeCallback = cb;
        return vi.fn().mockResolvedValue(undefined);
      });

      const consumer = new TaskFireConsumer(mockBus as EventBus, {
        consumerId: "worker-unregistered",
      });

      await consumer.subscribe({
        name: "ghostTask" as any,
        mode: "unicast",
        handler: vi.fn(),
      });

      const mockMsg = {
        id: "msg-ghost",
        deliveryCount: 1,
        body: { payload: {} },
        ack: vi.fn().mockResolvedValue(undefined),
        nack: vi.fn().mockResolvedValue(undefined),
      };

      // Force invocation with task name that is not in global registry
      await (consumer as any).handle("nonExistentTask" as any, mockMsg);

      expect(container.logger.warn).toHaveBeenCalledWith(
        "[TaskFireConsumer] Fire for 'nonExistentTask' has no registered handler (module unloaded?); acking."
      );
      expect(mockMsg.ack).toHaveBeenCalled();

      await consumer.stopConsuming();
    });

    it("nacks message and logs error when task handler throws an exception", async () => {
      let consumeCallback: Function | undefined;
      mockBus.consume.mockImplementation(async (_streams: any, _opts: any, cb: Function) => {
        if (_streams[0] === "lumi.scheduler.fire:failingTask") {
          consumeCallback = cb;
        }
        return vi.fn().mockResolvedValue(undefined);
      });

      const failingHandler = vi.fn().mockRejectedValue(new Error("Handler execution crashed"));
      registerTaskFireHandler("failingTask" as any, "unicast", failingHandler);

      const consumer = new TaskFireConsumer(mockBus as EventBus, {
        consumerId: "worker-failing",
      });
      await consumer.start();

      const mockMsg = {
        id: "msg-102",
        deliveryCount: 2,
        body: {
          payload: { data: 123 },
        },
        ack: vi.fn().mockResolvedValue(undefined),
        nack: vi.fn().mockResolvedValue(undefined),
      };

      await consumeCallback!(mockMsg);

      expect(failingHandler).toHaveBeenCalledWith({ data: 123 });
      expect(mockMsg.nack).toHaveBeenCalled();
      expect(mockMsg.ack).not.toHaveBeenCalled();
      expect(container.logger.error).toHaveBeenCalledWith(
        "[TaskFireConsumer] Handler for 'failingTask' failed (id=msg-102, deliveryCount=2):",
        expect.any(Error)
      );

      await consumer.stopConsuming();
    });
  });
});
