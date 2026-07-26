// Bus interface — Redis Streams event bus abstraction.
// Semantics target Redis Streams' consumer groups: at-least-once delivery,
// per-consumer pending list, explicit ack.

export interface BusMessage<T = unknown> {
  /** Unique message id (Redis stream id, e.g. `1718550000000-0`). */
  id: string;
  /** The decoded payload as published. */
  body: T;
  /**
   * How many times this entry has been delivered. 1 on the first read, ≥2 once
   * it has been XAUTOCLAIMed from a stalled consumer. Surfaces so handlers can
   * make idempotency decisions (e.g. dedupe a second delivery on side-effects
   * that aren't naturally idempotent).
   */
  deliveryCount: number;
  /** Acknowledge — removes the message from the consumer group's pending list. */
  ack: () => Promise<void>;
  /** Negative ack — leaves the message pending so it can be claimed by another consumer. */
  nack: () => Promise<void>;
}

export interface PublishOptions {
  /**
   * Cap the stream at approximately N entries (`MAXLEN ~`). When omitted, the
   * factory's `defaultMaxLen` is used. Set per-stream when one event type runs
   * much hotter than the rest.
   */
  maxLen?: number;
}

export interface ConsumeOptions {
  /** Consumer group name — created lazily on first read. */
  group: string;
  /** Stable per-replica id; persisting it across restarts lets a worker re-claim its own pending msgs. */
  consumer: string;
  /** ms to block on XREADGROUP before yielding. Default 5000. */
  blockMs?: number;
  /** Max batch size per read. Default 16. */
  batchSize?: number;
}

export interface EventBus {
  /** Push one message onto a stream. Returns the assigned message id. */
  publish<T>(stream: string, body: T, opts?: PublishOptions): Promise<string>;
  /**
   * Consume from `streams` indefinitely, invoking `handler` per message.
   * Returns a stop fn; the loop unwinds at the next blocking-read boundary.
   * The handler MUST call `msg.ack()` (or `msg.nack()`) — failure to ack
   * leaves the message in the pending list, where it can be auto-claimed.
   */
  consume<T>(
    streams: readonly string[],
    opts: ConsumeOptions,
    handler: (msg: BusMessage<T>) => Promise<void>,
  ): Promise<() => Promise<void>>;
  /** Release all underlying connections. Safe to call multiple times. */
  close(): Promise<void>;
}

export type TransportKind = "streams";
