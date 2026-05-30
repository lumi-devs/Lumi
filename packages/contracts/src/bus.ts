// Cross-process fanout event envelope (RabbitMQ `lumi.events`, later Redis Streams).
// Producers stamp `event` + `ts`; the rest of the payload is event-specific.

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
