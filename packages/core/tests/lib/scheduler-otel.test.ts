import { describe, it, expect, afterEach } from "bun:test";
import {
  trace,
  context as otelContext,
  TraceFlags,
  type SpanContext,
} from "@opentelemetry/api";
import { startTracing, shutdownTracing } from "@lumi/observability";
import { wrapWithTraceContext, unwrapTraceContext } from "@lumi/lib/scheduler/otel.js";

const fakeProducerSpanContext: SpanContext = {
  traceId: "0af7651916cd43dd8448eb211c80319c",
  spanId: "b7ad6b7169203331",
  traceFlags: TraceFlags.SAMPLED,
  isRemote: false,
};

describe("scheduler-otel", () => {
  it("is a no-op when there is no active span (tracing disabled)", () => {
    const payload = { foo: "bar" };
    expect(wrapWithTraceContext(payload)).toBe(payload);
  });

  it("passes a plain payload through unwrapTraceContext unchanged", () => {
    const result = unwrapTraceContext({ plain: true });
    expect(result.payload).toEqual({ plain: true });
    expect(result.context).toBeUndefined();
    expect(result.messageId).toBeUndefined();
  });

  describe("with tracing enabled", () => {
    const origOtel = process.env["OTEL_ENABLED"];

    afterEach(async () => {
      await shutdownTracing();
      if (origOtel === undefined) delete process.env["OTEL_ENABLED"];
      else process.env["OTEL_ENABLED"] = origOtel;
    });

    it("round-trips the active trace context through inject/extract", () => {
      process.env["OTEL_ENABLED"] = "true";
      startTracing({ service: "test-scheduler-otel" });

      const producerContext = trace.setSpanContext(
        otelContext.active(),
        fakeProducerSpanContext,
      );

      const {
        wrapped,
        payload: unwrapped,
        context,
        messageId,
      } = otelContext.with(producerContext, () => {
        const payload = { foo: "bar" };
        const w = wrapWithTraceContext(payload);
        const result = unwrapTraceContext(w);
        return { wrapped: w, ...result };
      });

      expect(wrapped).not.toEqual({ foo: "bar" });
      expect(wrapped).toHaveProperty("__lumiOtel");
      expect((wrapped as Record<string, unknown>)["payload"]).toEqual({
        foo: "bar",
      });
      expect(unwrapped).toEqual({ foo: "bar" });
      expect(messageId).toBeTruthy();
      expect(context).toBeDefined();

      const extractedSpanContext = trace.getSpanContext(context!);
      expect(extractedSpanContext?.traceId).toBe(
        fakeProducerSpanContext.traceId,
      );
      expect(extractedSpanContext?.spanId).toBe(
        fakeProducerSpanContext.spanId,
      );
    });

    it("does not leak the trace carrier into the unwrapped payload", () => {
      process.env["OTEL_ENABLED"] = "true";
      startTracing({ service: "test-scheduler-otel" });

      const producerContext = trace.setSpanContext(
        otelContext.active(),
        fakeProducerSpanContext,
      );

      const { payload } = otelContext.with(producerContext, () => {
        const wrapped = wrapWithTraceContext({ a: 1 });
        return unwrapTraceContext(wrapped);
      });

      expect(payload).toEqual({ a: 1 });
      expect(Object.keys(payload as object)).not.toContain("__lumiOtel");
      expect(Object.keys(payload as object)).not.toContain("traceparent");
    });
  });
});
