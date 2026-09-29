import { randomUUID } from "node:crypto";
import type { Context } from "@opentelemetry/api";
import { extractTraceContext, injectTraceContext } from "@lumi/observability";

/**
 * Reserved field name on BullMQ job data carrying the producer's trace
 * context. Never a legitimate scheduled-task payload key - `RelayTask.run()`
 * strips it before a task's `run()`/`registerTaskFireHandler` ever sees the
 * payload, so addon-facing `lumi/scheduling` payloads stay untouched.
 */
const OTEL_ENVELOPE_KEY = "__lumiOtel";

interface OtelCarrier {
  messageId: string;
  [key: string]: string;
}

interface OtelEnvelope<T> {
  [OTEL_ENVELOPE_KEY]: OtelCarrier;
  payload: T;
}

/**
 * Wraps a scheduled-task payload with the active trace's W3C carrier before
 * it becomes BullMQ job data. A no-op (returns `payload` unchanged) whenever
 * there's no active span to propagate - tracing disabled, or the call site
 * itself isn't inside a traced operation - so job data shape never changes
 * unless there's a real trace to link.
 */
export function wrapWithTraceContext<T>(payload: T): T | OtelEnvelope<T> {
  const carrier = injectTraceContext();
  if (Object.keys(carrier).length === 0) return payload;
  return {
    [OTEL_ENVELOPE_KEY]: { messageId: randomUUID(), ...carrier },
    payload,
  };
}

function isOtelEnvelope<T>(value: unknown): value is OtelEnvelope<T> {
  return (
    typeof value === "object" && value !== null && OTEL_ENVELOPE_KEY in value
  );
}

export interface UnwrappedTraceContext<T> {
  payload: T;
  context: Context | undefined;
  messageId: string | undefined;
}

/**
 * Reverses {@link wrapWithTraceContext}. Called once, at the top of
 * `RelayTask.run()`, so every downstream consumer (task piece, addon
 * `registerTaskFireHandler`) only ever sees the original payload.
 */
export function unwrapTraceContext<T>(
  value: T | OtelEnvelope<T>,
): UnwrappedTraceContext<T> {
  if (!isOtelEnvelope<T>(value)) {
    return { payload: value, context: undefined, messageId: undefined };
  }
  const { [OTEL_ENVELOPE_KEY]: carrier, payload } = value;
  const { messageId, ...traceCarrier } = carrier;
  return { payload, context: extractTraceContext(traceCarrier), messageId };
}
