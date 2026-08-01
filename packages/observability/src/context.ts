// Per-operation request context, shared by logger + tracer so a correlation id
// and the active trace follow a unit of work across awaits - and across
// services (worker↔scheduler) via the carrier helpers below.

import { AsyncLocalStorage } from "node:async_hooks";
import { context as otelContext, propagation, trace } from "@opentelemetry/api";

export interface RequestContext {
  /** Stable id for one logical operation; survives the bus/RPC hop. */
  correlationId: string;
  /** Where the work originated: "command" | "event" | "rpc" | "scheduler" | … */
  source?: string;
  guildId?: string;
  userId?: string;
  name?: string;
}

const als = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
  return als.run(ctx, fn);
}

export function getRequestContext(): RequestContext | undefined {
  return als.getStore();
}

/** Trace/span ids of the active OpenTelemetry span, if any. */
export function activeTraceIds(): { traceId?: string; spanId?: string } {
  const span = trace.getSpan(otelContext.active());
  if (!span) return {};
  const sc = span.spanContext();
  return { traceId: sc.traceId, spanId: sc.spanId };
}

/** Carrier (W3C `traceparent`) for the active trace - stamp onto outgoing bus/RPC messages. */
export function injectTraceContext(): Record<string, string> {
  const carrier: Record<string, string> = {};
  propagation.inject(otelContext.active(), carrier);
  return carrier;
}

/** Build an OpenTelemetry context from an incoming carrier so the consumer continues the trace. */
export function extractTraceContext(carrier: Record<string, unknown>) {
  return propagation.extract(otelContext.active(), carrier);
}

export { otelContext };
