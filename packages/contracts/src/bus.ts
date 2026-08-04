// Cross-process fanout event envelope contracts.

export type BusEventMessage<T extends Record<string, unknown> = Record<string, unknown>> = {
  event: string;
  ts: number;
  /** W3C `traceparent` (+ optional `tracestate`) so the consumer can continue the trace. */
  traceparent?: string;
  tracestate?: string;
} & T;
