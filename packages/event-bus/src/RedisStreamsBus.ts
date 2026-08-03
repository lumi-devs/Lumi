// Redis Streams transport: consumer groups give at-least-once delivery, horizontal
// worker scaling (each consumer claims a partition of the pending list), and bounded
// memory via MAXLEN ~. There is one stream per event type for per-event
// backpressure, independent MAXLEN and
// targeted lag dashboards; one consumer group per worker pool (default
// `lumi-workers`); and bodies JSON-encoded into a single `b` field.
//
// A background XAUTOCLAIM loop reclaims entries idle past `claimMinIdleMs` and
// redelivers them with `deliveryCount > 1` so callers can dedupe; once that exceeds
// `maxDeliveries` the entry is XADDed onto `<stream>:dlq` (kept for inspection, never
// auto-replayed) and XACKed off the live stream. Since Redis-side idle time can't see
// whether a handler is still running locally, an in-process `inFlight` set tracks ids
// currently mid-handler so the claim loop never double-invokes a handler that just
// happens to be slow; it does not (and cannot) prevent cross-consumer redelivery,
// which is inherent to at-least-once. A periodic stats callback reports XLEN + pending
// count so observability can update gauges without pulling prom-client into this
// package. Exactly-once is out of scope - the contract is at-least-once plus
// idempotent handlers - handlers must dedupe on a payload-level identifier, not the
// stream id (redelivery yields a new one).

import type { Redis } from "ioredis";
import type {
  BusMessage,
  ConsumeOptions,
  EventBus,
  PublishOptions,
} from "./types.js";

export interface StreamStats {
  /** Stream key (e.g. `lumi:gw:message_create`). */
  stream: string;
  /** Consumer group reading from `stream`. */
  group: string;
  /** Total entries in the stream right now (XLEN). */
  length: number;
  /** Entries pending ack for this group (XPENDING summary count). */
  pending: number;
  /** DLQ length (XLEN on `<stream>:dlq`). 0 if the DLQ has never been written. */
  dlqLength: number;
}

export interface RedisStreamsBusOptions {
  /** Dedicated ioredis connection for *publishes*. Must NOT be shared with the consumer connection. */
  publisher: Redis;
  /** Dedicated ioredis connection for *blocking reads*. ioredis multiplexes commands, but XREADGROUP BLOCK blocks the socket. */
  subscriber: Redis;
  /** Default per-stream cap. ~ is approximate (cheap); use 100k unless told otherwise. */
  defaultMaxLen?: number;
  /** Optional structured logger. */
  log?: (level: "info" | "warn" | "error", msg: string, meta?: object) => void;
  /**
   * Max delivery attempts before an entry is routed to the per-stream DLQ
   * (`<stream>:dlq`) and acked off the live stream. Default 5.
   */
  maxDeliveries?: number;
  /**
   * How long an entry must sit unacked in the pending list before it becomes
   * eligible for XAUTOCLAIM. Set this above the slowest legitimate handler
   * latency so healthy slow work isn't stolen. Default 60_000ms.
   */
  claimMinIdleMs?: number;
  /**
   * How often each consumer wakes to run XAUTOCLAIM against its streams.
   * Default 30_000ms. Set 0 to disable claiming (tests only).
   */
  claimIntervalMs?: number;
  /**
   * Optional periodic-stats callback. Receives a snapshot per stream every
   * `statsIntervalMs`. Used by observability to set Prometheus gauges.
   */
  onStats?: (stats: StreamStats) => void;
  /** How often `onStats` is invoked per stream. Default 10_000ms. */
  statsIntervalMs?: number;
}

// ioredis types the stream commands (XREADGROUP/XAUTOCLAIM/XPENDING) with a
// pile of overloads that don't accept a spread `unknown[]`, so calling them
// dynamically needs a cast. Centralize that one unsafe shape here and cast each
// connection exactly once (pubStream/subStream) instead of at every call site.
interface RedisStreamCommands {
  xreadgroup(...args: unknown[]): Promise<unknown>;
  xautoclaim(...args: unknown[]): Promise<unknown>;
  xpending(...args: unknown[]): Promise<unknown>;
}

export class RedisStreamsBus implements EventBus {
  private readonly publisher: Redis;
  private readonly subscriber: Redis;
  /** Typed view of the publisher connection for the awkwardly-overloaded stream commands. */
  private readonly pubStream: RedisStreamCommands;
  private readonly defaultMaxLen: number;
  private readonly knownGroups = new Set<string>();
  private readonly log: NonNullable<RedisStreamsBusOptions["log"]>;
  private readonly maxDeliveries: number;
  private readonly claimMinIdleMs: number;
  private readonly claimIntervalMs: number;
  private readonly onStats: RedisStreamsBusOptions["onStats"];
  private readonly statsIntervalMs: number;
  private readonly timers = new Set<NodeJS.Timeout>();
  /**
   * Message ids (keyed `${stream}\0${id}`) whose handler invocation is
   * currently in flight in this process. XAUTOCLAIM only knows Redis-side
   * idle time since last delivery - it has no idea a handler is still
   * running locally past claimMinIdleMs (e.g. a slow DB write). Without this,
   * the claim loop (runClaim) can reclaim and re-invoke the handler for an
   * entry the main read loop is still processing, causing two concurrent
   * handler calls for the same logical event. Populated right before
   * `handler()` is invoked in `deliver`, cleared in a `finally` once it
   * settles. This only guards against same-process double-invocation; it
   * does not (and cannot) prevent cross-consumer redelivery, which is
   * inherent to at-least-once delivery and is why handlers must still be
   * idempotent.
   */
  private readonly inFlight = new Set<string>();
  private closed = false;

  public constructor(opts: RedisStreamsBusOptions) {
    this.publisher = opts.publisher;
    this.subscriber = opts.subscriber;
    this.pubStream = this.publisher;
    this.defaultMaxLen = opts.defaultMaxLen ?? 100_000;
    this.log = opts.log ?? (() => undefined);
    this.maxDeliveries = opts.maxDeliveries ?? 5;
    this.claimMinIdleMs = opts.claimMinIdleMs ?? 60_000;
    this.claimIntervalMs = opts.claimIntervalMs ?? 30_000;
    this.onStats = opts.onStats;
    this.statsIntervalMs = opts.statsIntervalMs ?? 10_000;
  }

  public async publish<T>(
    stream: string,
    body: T,
    opts?: PublishOptions,
  ): Promise<string> {
    if (this.closed) throw new Error("RedisStreamsBus closed");
    const maxLen = opts?.maxLen ?? this.defaultMaxLen;
    const id = await this.publisher.xadd(
      stream,
      "MAXLEN",
      "~",
      String(maxLen),
      "*",
      "b",
      JSON.stringify(body),
    );
    if (!id) throw new Error(`XADD on ${stream} returned null`);
    return id;
  }

  public async consume<T>(
    streams: readonly string[],
    opts: ConsumeOptions,
    handler: (msg: BusMessage<T>) => Promise<void>,
  ): Promise<() => Promise<void>> {
    const blockMs = opts.blockMs ?? 5000;
    const batchSize = opts.batchSize ?? 16;
    for (const stream of streams) await this.ensureGroup(stream, opts.group);

    // Each consume() call gets its own connection - XREADGROUP BLOCK holds
    // the socket, and sharing one across concurrent consume() loops would
    // serialize them behind each other.
    const readConn = this.subscriber.duplicate() as unknown as RedisStreamCommands & {
      quit(): Promise<string>;
      disconnect(): void;
    };

    let stopped = false;
    let loopDone: Promise<void> = Promise.resolve();
    const loop = async () => {
      while (!stopped && !this.closed) {
        // XREADGROUP GROUP <group> <consumer> COUNT <n> BLOCK <ms> STREAMS s1 s2 > >
        const args: (string | number)[] = [
          "GROUP",
          opts.group,
          opts.consumer,
          "COUNT",
          batchSize,
          "BLOCK",
          blockMs,
          "STREAMS",
          ...streams,
          ...streams.map(() => ">"),
        ];
        let resp: unknown;
        try {
          resp = await readConn.xreadgroup(...args);
        } catch (err) {
          if (this.closed || stopped) return;
          this.log("error", "xreadgroup failed", { err: String(err) });
          await sleep(500);
          continue;
        }
        if (!resp) continue;

        for (const [stream, entries] of resp as Array<
          [string, Array<[string, string[]]>]
        >) {
          for (const [id, fields] of entries) {
            try {
              await this.deliver(stream, opts.group, id, fields, 1, handler);
            } catch (err) {
              this.log("error", "deliver failed", { stream, id, err: String(err) });
            }
          }
        }
      }
    };
    loopDone = loop();
    loopDone.catch(() => undefined);

    // Stale-consumer claim loop. Runs alongside the main read loop on the same
    // consumer id; XAUTOCLAIM scans the group's pending list and hands us back
    // any entries idle > claimMinIdleMs that we then redeliver locally.
    let claimTimer: NodeJS.Timeout | undefined;
    if (this.claimIntervalMs > 0) {
      claimTimer = setInterval(() => {
        if (stopped || this.closed) return;
        void this.runClaim(streams, opts, handler).catch((err) => {
          this.log("error", "xautoclaim loop failed", { err: String(err) });
        });
      }, this.claimIntervalMs);
      this.timers.add(claimTimer);
    }

    // Stats loop. Idempotent and cheap (XLEN + XPENDING summary).
    let statsTimer: NodeJS.Timeout | undefined;
    if (this.onStats && this.statsIntervalMs > 0) {
      statsTimer = setInterval(() => {
        if (stopped || this.closed) return;
        void this.runStats(streams, opts.group).catch((err) => {
          this.log("error", "stats loop failed", { err: String(err) });
        });
      }, this.statsIntervalMs);
      this.timers.add(statsTimer);
    }

    return async () => {
      stopped = true;
      if (claimTimer) {
        clearInterval(claimTimer);
        this.timers.delete(claimTimer);
      }
      if (statsTimer) {
        clearInterval(statsTimer);
        this.timers.delete(statsTimer);
      }
      // Wait for the read loop to actually exit. The current XREADGROUP BLOCK
      // returns within `blockMs`, and any in-flight `deliver()` (handler +
      // XACK) finishes its iteration before the loop re-checks `stopped`.
      // Without this await, callers can close the underlying Redis connection
      // mid-XACK and leak pending entries until XAUTOCLAIM picks them up.
      await loopDone.catch(() => undefined);
      await readConn.quit().catch(() => readConn.disconnect());
    };
  }

  public close(): Promise<void> {
    this.closed = true;
    for (const t of this.timers) clearInterval(t);
    this.timers.clear();
    // Owned-connection lifecycle is the caller's (createEventBus closes them).
    return Promise.resolve();
  }

  /**
   * One-shot delivery to the handler. Centralized so the main-read path and
   * the claim path share DLQ + ack semantics.
   */
  private async deliver<T>(
    stream: string,
    group: string,
    id: string,
    fields: string[],
    deliveryCount: number,
    handler: (msg: BusMessage<T>) => Promise<void>,
  ): Promise<void> {
    // Deliveries beyond the limit go straight to the DLQ - don't even invoke
    // the handler again. The entry has already been redelivered N times; we
    // know it's poison.
    if (deliveryCount > this.maxDeliveries) {
      try {
        await this.sendToDlq(stream, id, fields, deliveryCount);
      } catch (err) {
        this.log("error", "sendToDlq failed", { stream, id, err: String(err) });
      }
      await this.publisher.xack(stream, group, id);
      this.log("warn", "dropped poison message to DLQ", {
        stream,
        id,
        deliveryCount,
      });
      return;
    }

    let body: T;
    try {
      body = decodeBody<T>(fields);
    } catch (err) {
      this.log("error", "malformed payload JSON or missing fields", {
        stream,
        id,
        err: String(err),
      });
      try {
        await this.sendToDlq(stream, id, fields, deliveryCount);
      } catch (dlqErr) {
        this.log("error", "sendToDlq failed", {
          stream,
          id,
          err: String(dlqErr),
        });
      }
      await this.publisher.xack(stream, group, id);
      return;
    }

    const msg: BusMessage<T> = {
      id,
      body,
      deliveryCount,
      ack: async () => {
        await this.publisher.xack(stream, group, id);
      },
      nack: async () => {
        // No-op - leaving the entry unacked makes it eligible for XAUTOCLAIM
        // after claimMinIdleMs.
      },
    };
    const inFlightKey = `${stream}\0${id}`;
    this.inFlight.add(inFlightKey);
    try {
      await handler(msg);
    } catch (err) {
      this.log("error", "handler threw; leaving entry pending", {
        stream,
        id,
        deliveryCount,
        err: String(err),
      });
    } finally {
      this.inFlight.delete(inFlightKey);
    }
  }

  private async runClaim<T>(
    streams: readonly string[],
    opts: ConsumeOptions,
    handler: (msg: BusMessage<T>) => Promise<void>,
  ): Promise<void> {
    for (const stream of streams) {
      // XAUTOCLAIM <key> <group> <consumer> <min-idle-time> <start> [COUNT n]
      // → [next-cursor, [[id, [field, value, ...]], ...], [deleted-ids]]
      let cursor = "0-0";
      // Bound the loop - claim up to ~128 entries per tick, then yield.
      for (let i = 0; i < 8; i++) {
        const resp = (await this.pubStream.xautoclaim(
          stream,
          opts.group,
          opts.consumer,
          this.claimMinIdleMs,
          cursor,
          "COUNT",
          16,
        )) as [string, Array<[string, string[]]>, string[]] | null;
        if (!resp) break;
        const [nextCursor, entries] = resp;
        for (const [id, fields] of entries) {
          // Redis-side idle time only reflects time since last delivery - it
          // has no visibility into whether a handler invocation from an
          // earlier delivery is still running in this process. Skip
          // redelivering ids we're already handling locally; XAUTOCLAIM has
          // still reset their idle clock, so they'll be reconsidered next
          // cycle if genuinely stuck, without us double-invoking a handler
          // that's mid-flight.
          if (this.inFlight.has(`${stream}\0${id}`)) {
            this.log("warn", "skipping reclaim of in-flight message", {
              stream,
              id,
            });
            continue;
          }
          // XPENDING for delivery count. XAUTOCLAIM increments it for us;
          // we read it back to drive the DLQ threshold.
          const deliveryCount = await this.pendingDeliveryCount(
            stream,
            opts.group,
            id,
          );
          try {
            await this.deliver(
              stream,
              opts.group,
              id,
              fields,
              deliveryCount,
              handler,
            );
          } catch (err) {
            this.log("error", "claim deliver failed", {
              stream,
              id,
              err: String(err),
            });
          }
        }
        cursor = nextCursor;
        if (cursor === "0-0") break;
      }
    }
  }

  private async pendingDeliveryCount(
    stream: string,
    group: string,
    id: string,
  ): Promise<number> {
    // XPENDING <key> <group> IDLE 0 <start> <end> 1
    const resp = (await this.pubStream.xpending(
      stream,
      group,
      "IDLE",
      0,
      id,
      id,
      1,
    )) as Array<[string, string, number, number]> | null;
    if (!resp || resp.length === 0) return 1;
    const entry = resp[0]!;
    // [id, consumer, idle-ms, delivery-count]
    return Number(entry[3]) || 1;
  }

  private async sendToDlq(
    stream: string,
    id: string,
    fields: string[],
    deliveryCount: number,
  ): Promise<void> {
    const dlq = `${stream}:dlq`;
    const body = fields[1] ?? "";
    await this.publisher.xadd(
      dlq,
      "MAXLEN",
      "~",
      String(this.defaultMaxLen),
      "*",
      "b",
      body,
      "src_id",
      id,
      "src_stream",
      stream,
      "delivery_count",
      String(deliveryCount),
      "dead_at",
      String(Date.now()),
    );
  }

  private async runStats(
    streams: readonly string[],
    group: string,
  ): Promise<void> {
    if (!this.onStats) return;
    for (const stream of streams) {
      const [length, pending, dlqLength] = await Promise.all([
        this.publisher.xlen(stream).catch(() => 0),
        this.pendingCount(stream, group),
        this.publisher.xlen(`${stream}:dlq`).catch(() => 0),
      ]);
      this.onStats({ stream, group, length, pending, dlqLength });
    }
  }

  private async pendingCount(stream: string, group: string): Promise<number> {
    try {
      // XPENDING <key> <group> → [count, min-id, max-id, [[consumer, count], ...]]
      const resp = (await this.pubStream.xpending(stream, group)) as
        [number, ...unknown[]] | null;
      if (!resp) return 0;
      return Number(resp[0]) || 0;
    } catch {
      return 0;
    }
  }

  private async ensureGroup(stream: string, group: string): Promise<void> {
    const key = `${stream}::${group}`;
    if (this.knownGroups.has(key)) return;
    try {
      await this.publisher.xgroup("CREATE", stream, group, "0", "MKSTREAM");
    } catch (err) {
      const msg = String(err);
      if (!msg.includes("BUSYGROUP")) throw err;
    }
    this.knownGroups.add(key);
  }
}

function decodeBody<T>(fields: string[]): T {
  // XADD wrote ["b", "<json>"]. Find the `b` field defensively in case more are added later.
  for (let i = 0; i < fields.length; i += 2) {
    if (fields[i] === "b") return JSON.parse(fields[i + 1]!) as T;
  }
  throw new Error("RedisStreamsBus: message missing `b` field");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
