import { randomUUID } from "node:crypto";
import type { Context } from "@opentelemetry/api";
import { extractTraceContext, injectTraceContext } from "#src/observability/Index.ts";

const OTEL_ENVELOPE_KEY = "__lumiOtel";

interface OtelCarrier {
  messageId: string;
  [key: string]: string;
}

interface OtelEnvelope<T> {
  [OTEL_ENVELOPE_KEY]: OtelCarrier;
  payload: T;
}

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
