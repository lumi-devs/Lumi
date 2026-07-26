// Cross-process fanout event envelope contracts.


export interface BusEventEnvelope<T = Record<string, unknown>> {
  event: string;
  ts: number;
  /** W3C `traceparent` (+ optional `tracestate`) so the consumer can continue the trace. */
  traceparent?: string;
  tracestate?: string;
  payload?: T;
}

/** The raw object placed on the wire: `{ event, ts, ...payload }`. */
export type BusEventMessage = {
  event: string;
  ts: number;
  traceparent?: string;
  tracestate?: string;
} & Record<string, unknown>;
