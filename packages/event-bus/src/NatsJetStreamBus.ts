// NATS JetStream transport. Mirrors RedisStreamsBus: at-least-once publish/consume
// with explicit ack, one durable consumer per (subject, group), and a DLQ after
// maxDeliveries. Bus keys map to subjects by swapping ":" for ".". The factory owns
// the connection; the stream and consumers are created lazily and idempotently.

import type {
  ConsumerMessages,
  JetStreamClient,
  JetStreamManager,
  JsMsg,
  NatsConnection,
} from "nats";
import { AckPolicy, RetentionPolicy } from "nats";
import type {
  BusMessage,
  ConsumeOptions,
  EventBus,
  PublishOptions,
} from "./types.js";
import type { StreamStats } from "./RedisStreamsBus.js";

/** Capture all bus events under one JetStream stream — keeps ops simple. */
const STREAM_NAME = "LUMI_EVENTS";
/** Wildcard subject the JetStream stream binds to. */
const STREAM_SUBJECTS = ["lumi.>"];

export interface NatsJetStreamBusOptions {
  /** Live NATS connection (factory owns its lifecycle). */
  connection: NatsConnection;
  /** Default per-stream cap (used as `max_msgs` when the stream is created). */
  defaultMaxLen?: number;
  log?: (level: "info" | "warn" | "error", msg: string, meta?: object) => void;
  /** Max redeliveries before we DLQ the message ourselves. Default 5. */
  maxDeliveries?: number;
  /**
   * ackWait in ms — how long JetStream waits for an ack before redelivering.
   * Matches `claimMinIdleMs` on the Redis side. Default 60_000.
   */
  ackWaitMs?: number;
  /** Periodic stats callback per consumed subject. */
  onStats?: (stats: StreamStats) => void;
  /** Stats poll interval. Default 10_000. */
  statsIntervalMs?: number;
}

export class NatsJetStreamBus implements EventBus {
  private readonly nc: NatsConnection;
  private readonly defaultMaxLen: number;
  private readonly log: NonNullable<NatsJetStreamBusOptions["log"]>;
  private readonly maxDeliveries: number;
  private readonly ackWaitNs: number;
  private readonly onStats: NatsJetStreamBusOptions["onStats"];
  private readonly statsIntervalMs: number;
  private readonly timers = new Set<NodeJS.Timeout>();
  // Live pull iterators from in-flight consume() loops. A parked `for await` can't
  // be ended by a flag once the stream drains, so stop()/close() call msgs.stop().
  private readonly activeConsumers = new Set<ConsumerMessages>();
  private js: JetStreamClient | null = null;
  private jsm: JetStreamManager | null = null;
  private streamReady: Promise<void> | null = null;
  private closed = false;

  public constructor(opts: NatsJetStreamBusOptions) {
    this.nc = opts.connection;
    this.defaultMaxLen = opts.defaultMaxLen ?? 100_000;
    this.log = opts.log ?? (() => undefined);
    this.maxDeliveries = opts.maxDeliveries ?? 5;
    // JetStream takes ack_wait in nanoseconds.
    this.ackWaitNs = (opts.ackWaitMs ?? 60_000) * 1_000_000;
    this.onStats = opts.onStats;
    this.statsIntervalMs = opts.statsIntervalMs ?? 10_000;
  }

  public async publish<T>(
    stream: string,
    body: T,
    opts?: PublishOptions,
  ): Promise<string> {
    if (this.closed) throw new Error("NatsJetStreamBus closed");
    await this.ensureStream(opts?.maxLen ?? this.defaultMaxLen);
    const js = this.js!;
    const subject = subjectOf(stream);
    const ack = await js.publish(subject, encode(body));
    // JetStream's per-stream sequence number is the closest analogue to a
    // Redis stream id; expose it as the BusMessage id on the consume side.
    return String(ack.seq);
  }

  public async consume<T>(
    streams: readonly string[],
    opts: ConsumeOptions,
    handler: (msg: BusMessage<T>) => Promise<void>,
  ): Promise<() => Promise<void>> {
    await this.ensureStream(this.defaultMaxLen);
    const js = this.js!;
    const jsm = this.jsm!;
    const batchSize = opts.batchSize ?? 16;

    // One durable consumer per (subject, group). Durable name shape mirrors
    // the Redis group::stream tuple so two replicas in the same group share
    // a single pending list.
    const consumers = await Promise.all(
      streams.map(async (stream) => {
        const subject = subjectOf(stream);
        const durable = durableName(opts.group, subject);
        await this.ensureConsumer(jsm, durable, subject);
        return { stream, subject, durable };
      }),
    );

    let stopped = false;
    const loopDones: Promise<void>[] = [];
    // Live iterators owned by *this* consume() call, so stop() interrupts only
    // its own loops (close() drains all of them via this.activeConsumers).
    const active = new Set<ConsumerMessages>();

    for (const { subject, durable } of consumers) {
      const loop = async () => {
        // consume() parks `for await` on an open pull request, so the in-loop flag
        // only trips when a message arrives; stop()/close() end it via msgs.stop().
        while (!stopped && !this.closed) {
          let msgs: ConsumerMessages | undefined;
          try {
            const consumer = await js.consumers.get(STREAM_NAME, durable);
            msgs = await consumer.consume({ max_messages: batchSize });
            this.activeConsumers.add(msgs);
            active.add(msgs);
            for await (const m of msgs) {
              if (stopped || this.closed) break;
              await this.deliver<T>(subject, durable, m, handler);
            }
          } catch (err) {
            if (this.closed || stopped) return;
            this.log("error", "nats consume failed", {
              subject,
              err: String(err),
            });
            await sleep(500);
          } finally {
            if (msgs) {
              this.activeConsumers.delete(msgs);
              active.delete(msgs);
              msgs.stop(); // idempotent; tears down the server-side pull
            }
          }
        }
      };
      const done = loop();
      done.catch(() => undefined);
      loopDones.push(done);
    }

    // Stats loop — one tick polls every consumer's info.
    if (this.onStats && this.statsIntervalMs > 0) {
      const t = setInterval(() => {
        if (stopped || this.closed) return;
        void this.runStats(consumers, opts.group).catch((err) =>
          this.log("error", "nats stats failed", { err: String(err) }),
        );
      }, this.statsIntervalMs);
      this.timers.add(t);
    }

    return async () => {
      stopped = true;
      // Break the parked `for await` loops by stopping their live iterators;
      // otherwise awaiting loopDones would hang once the stream is drained.
      for (const msgs of active) msgs.stop();
      await Promise.allSettled(loopDones);
    };
  }

  public close(): Promise<void> {
    this.closed = true;
    for (const t of this.timers) clearInterval(t);
    this.timers.clear();
    // Stop any still-running consume() iterators so their loops observe `closed`
    // and exit — otherwise the factory's nc.drain() blocks on live pulls.
    for (const msgs of this.activeConsumers) msgs.stop();
    this.activeConsumers.clear();
    // Connection close is the factory's responsibility (mirrors RedisStreamsBus).
    return Promise.resolve();
  }

  private async deliver<T>(
    subject: string,
    durable: string,
    m: JsMsg,
    handler: (msg: BusMessage<T>) => Promise<void>,
  ): Promise<void> {
    // redeliveryCount = num_delivered, already 1-based (first delivery = 1), same
    // as RedisStreamsBus. Don't add 1 or a message DLQs one delivery early.
    const deliveryCount = m.info.redeliveryCount;
    if (deliveryCount > this.maxDeliveries) {
      await this.sendToDlq(subject, m, deliveryCount).catch((err) =>
        this.log("error", "dlq publish failed", {
          subject,
          err: String(err),
        }),
      );
      m.ack();
      this.log("warn", "dropped poison message to DLQ", {
        subject,
        durable,
        deliveryCount,
        streamSeq: m.info.streamSequence,
      });
      return;
    }

    let body: T;
    try {
      body = decode<T>(m.data);
    } catch (err) {
      // Malformed envelope: nothing useful to do with it; DLQ + ack.
      await this.sendToDlq(subject, m, deliveryCount).catch(() => undefined);
      m.ack();
      this.log("error", "drop unparseable message to DLQ", {
        subject,
        err: String(err),
      });
      return;
    }

    const busMsg: BusMessage<T> = {
      id: String(m.info.streamSequence),
      body,
      deliveryCount,
      ack: () => {
        // Fire-and-forget, like Redis XACK. ackAck() adds a per-message round-trip
        // that blows the latency SLO; a lost ack just redelivers, which the
        // idempotent handler tolerates.
        m.ack();
        return Promise.resolve();
      },
      nack: () => {
        // JetStream supports explicit NAK with redeliver delay; mirror Redis
        // semantics by leaving it for ackWait to expire.
        m.nak();
        return Promise.resolve();
      },
    };

    try {
      await handler(busMsg);
    } catch (err) {
      // Leave un-acked → JetStream will redeliver after ackWait.
      this.log("error", "handler threw; leaving entry pending", {
        subject,
        durable,
        deliveryCount,
        err: String(err),
      });
    }
  }

  private async sendToDlq(
    subject: string,
    m: JsMsg,
    deliveryCount: number,
  ): Promise<void> {
    const dlq = `${subject}.dlq`;
    const headers = {
      src_subject: subject,
      src_seq: String(m.info.streamSequence),
      delivery_count: String(deliveryCount),
      dead_at: String(Date.now()),
    };
    // We can't set arbitrary headers via js.publish without the headers API
    // (avoiding it to keep the dep surface tiny). Instead pack into the body.
    const payload = JSON.stringify({
      meta: headers,
      body: tryDecodeRaw(m.data),
    });
    await this.js!.publish(dlq, new TextEncoder().encode(payload));
  }

  private async ensureStream(maxLen: number): Promise<void> {
    if (this.streamReady) return this.streamReady;
    this.streamReady = (async () => {
      this.js = this.nc.jetstream();
      this.jsm = await this.nc.jetstreamManager();
      try {
        await this.jsm.streams.add({
          name: STREAM_NAME,
          subjects: STREAM_SUBJECTS,
          retention: RetentionPolicy.Limits,
          max_msgs: maxLen,
        });
      } catch (err) {
        const msg = String(err);
        if (
          !msg.includes("already in use") &&
          !msg.includes("stream name already") &&
          !msg.includes("subjects overlap") &&
          !msg.includes("stream name in use")
        ) {
          this.streamReady = null;
          throw err;
        }
      }
    })();
    return this.streamReady;
  }

  private async ensureConsumer(
    jsm: JetStreamManager,
    durable: string,
    subject: string,
  ): Promise<void> {
    try {
      await jsm.consumers.add(STREAM_NAME, {
        durable_name: durable,
        filter_subject: subject,
        ack_policy: AckPolicy.Explicit,
        // Cap server-side too. We still DLQ ourselves on max+1 so we can
        // capture the body — server's own dead-letter discard would lose it.
        max_deliver: this.maxDeliveries + 1,
        ack_wait: this.ackWaitNs,
      });
    } catch (err) {
      const msg = String(err);
      // "consumer name already in use" → already created by a peer; fine.
      if (!msg.includes("already in use")) throw err;
    }
  }

  private async runStats(
    consumers: ReadonlyArray<{
      stream: string;
      subject: string;
      durable: string;
    }>,
    group: string,
  ): Promise<void> {
    if (!this.onStats || !this.jsm) return;
    for (const { stream, subject, durable } of consumers) {
      try {
        const info = await this.jsm.consumers.info(STREAM_NAME, durable);
        const dlqLength = await this.subjectLength(`${subject}.dlq`).catch(
          () => 0,
        );
        this.onStats({
          stream,
          group,
          // Total messages waiting on the stream for this subject (server returns
          // pending = "messages we haven't delivered yet"). num_ack_pending is
          // the in-flight (delivered but un-acked) count; we add them so the
          // gauge matches Redis' XPENDING semantics ("entries owing an ack").
          length:
            info.num_pending +
            info.num_ack_pending +
            info.delivered.consumer_seq,
          pending: info.num_ack_pending,
          dlqLength,
        });
      } catch (err) {
        this.log("warn", "consumer info failed", {
          durable,
          err: String(err),
        });
      }
    }
  }

  private async subjectLength(subject: string): Promise<number> {
    if (!this.jsm) return 0;
    try {
      const info = await this.jsm.streams.info(STREAM_NAME, {
        subjects_filter: subject,
      });
      const map = info.state.subjects ?? {};
      return map[subject] ?? 0;
    } catch {
      return 0;
    }
  }
}

function subjectOf(stream: string): string {
  // bus keys use `:` as a separator; NATS subjects use `.`.
  return stream.replace(/:/g, ".");
}

function durableName(group: string, subject: string): string {
  // Durable names must be alphanumeric + `_`/`-`. Translate `.` from subject.
  return `${group}__${subject.replace(/\./g, "_")}`;
}

function encode(body: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(body));
}

function decode<T>(data: Uint8Array): T {
  return JSON.parse(new TextDecoder().decode(data)) as T;
}

function tryDecodeRaw(data: Uint8Array): unknown {
  try {
    return decode(data);
  } catch {
    return new TextDecoder().decode(data);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
