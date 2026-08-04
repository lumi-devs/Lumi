// Cross-process fanout event envelope contracts.

/**
 * The raw object placed on the wire by `RabbitClient#publishEvent` and read
 * back by `RabbitClient#handleEvent` (packages/core/src/lib/rabbitmq/index.ts):
 * envelope fields flat alongside the spread event payload -
 * `{ event, ts, traceparent?, tracestate?, ...payload }`.
 *
 * @remarks
 *
 * There is no nested `payload` field - `publishEvent`'s `payload` argument is
 * spread directly onto the envelope object before it's JSON-stringified, so a
 * consumer reaching for `msg.payload.foo` (the shape a nested-envelope type
 * would suggest) gets `undefined`, not the field it wants. `T` is the
 * payload's own field shape, merged in flat, so a producer/consumer for a
 * specific event can write `BusEventMessage<{ guildId: string }>` and get
 * `msg.guildId: string` instead of having to trust an untyped `unknown`.
 */
export type BusEventMessage<T extends Record<string, unknown> = Record<string, unknown>> = {
  event: string;
  ts: number;
  /** W3C `traceparent` (+ optional `tracestate`) so the consumer can continue the trace. */
  traceparent?: string;
  tracestate?: string;
} & T;
