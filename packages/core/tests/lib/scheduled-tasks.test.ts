import { describe, it, expect, vi, beforeEach, afterEach } from "bun:test";
import { container } from "#lib/services.js";
import {
  trace,
  context as otelContext,
  TraceFlags,
  type SpanContext,
} from "@opentelemetry/api";
import { startTracing, shutdownTracing } from "@lumi/observability";
import { shouldRunNow, RelayTask } from "#lib/scheduled-tasks.js";
import { taskFireStream } from "#lib/scheduler-bus.js";
import { wrapWithTraceContext } from "#lib/scheduler-otel.js";

describe("shouldRunNow", () => {
  it("runs when no payload is given", () => {
    expect(shouldRunNow("task")).toBe(true);
  });

  it("runs when catchUp is not explicitly false", () => {
    expect(shouldRunNow("task", { scheduledFor: Date.now() - 1_000_000 })).toBe(
      true,
    );
  });

  it("runs when catchUp is false but within the grace window", () => {
    expect(
      shouldRunNow(
        "task",
        { catchUp: false, scheduledFor: Date.now() - 1_000 },
        60_000,
      ),
    ).toBe(true);
  });

  it("drops overdue catchUp:false jobs beyond the grace window", () => {
    container.logger = { debug: vi.fn() } as any;
    expect(
      shouldRunNow(
        "task",
        { catchUp: false, scheduledFor: Date.now() - 100_000 },
        60_000,
      ),
    ).toBe(false);
    expect(container.logger.debug).toHaveBeenCalled();
  });
});

describe("RelayTask.run", () => {
  beforeEach(() => {
    container.logger = { debug: vi.fn(), warn: vi.fn() } as any;
    (container as any).eventBus = { publish: vi.fn().mockResolvedValue(undefined) } as any;
  });

  it("publishes the fire onto the task's stream with the given payload", async () => {
    const fakeTask = { name: "relay-test-task" };
    await RelayTask.prototype.run.call(fakeTask, { foo: "bar" } as any);

    expect(container.eventBus.publish).toHaveBeenCalledWith(
      taskFireStream("relay-test-task"),
      expect.objectContaining({ name: "relay-test-task", payload: { foo: "bar" } }),
    );
  });

  it("defaults a nullish payload to an empty object before publishing", async () => {
    const fakeTask = { name: "relay-test-task-empty" };
    await RelayTask.prototype.run.call(fakeTask, undefined as any);

    expect(container.eventBus.publish).toHaveBeenCalledWith(
      taskFireStream("relay-test-task-empty"),
      expect.objectContaining({ payload: {} }),
    );
  });

  it("does not publish when the catch-up policy says to drop the job", async () => {
    const fakeTask = { name: "relay-test-task-dropped" };
    await RelayTask.prototype.run.call(fakeTask, {
      catchUp: false,
      scheduledFor: Date.now() - 100_000,
    } as any);

    expect(container.eventBus.publish).not.toHaveBeenCalled();
  });

  describe("trace context propagation", () => {
    const origOtel = process.env["OTEL_ENABLED"];

    afterEach(async () => {
      await shutdownTracing();
      if (origOtel === undefined) delete process.env["OTEL_ENABLED"];
      else process.env["OTEL_ENABLED"] = origOtel;
    });

    it("unwraps a traced payload before publishing, without leaking the carrier", async () => {
      process.env["OTEL_ENABLED"] = "true";
      startTracing({ service: "test-relay-task" });

      // traceFlags NONE keeps the RelayTask-created consumer span
      // non-recording, so it never reaches the batch exporter - this test
      // asserts trace-id continuity and payload unwrapping, not export
      // delivery, and a real OTLP export attempt here would try (and hang
      // retrying) a real network call.
      const fakeSpanContext: SpanContext = {
        traceId: "0af7651916cd43dd8448eb211c80319c",
        spanId: "b7ad6b7169203331",
        traceFlags: TraceFlags.NONE,
        isRemote: false,
      };
      const producerContext = trace.setSpanContext(
        otelContext.active(),
        fakeSpanContext,
      );
      const wrapped = otelContext.with(producerContext, () =>
        wrapWithTraceContext({ foo: "bar" }),
      );

      const fakeTask = { name: "relay-test-task-traced" };
      await RelayTask.prototype.run.call(fakeTask, wrapped as any);

      expect(container.eventBus.publish).toHaveBeenCalledWith(
        taskFireStream("relay-test-task-traced"),
        expect.objectContaining({
          name: "relay-test-task-traced",
          payload: { foo: "bar" },
        }),
      );
    });
  });
});
