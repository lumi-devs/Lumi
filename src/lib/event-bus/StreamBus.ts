

import type Valkey from "iovalkey";
import type {
  BusMessage,
  ConsumeOptions,
  EventBus,
  PublishOptions,
} from "#src/lib/event-bus/Types.js";

export interface StreamStats {

  stream: string;

  group: string;

  length: number;

  pending: number;

  dlqLength: number;
}

export interface StreamBusOptions {

  publisher: Valkey;

  subscriber: Valkey;

  defaultMaxLen?: number;

  log?: (level: "info" | "warn" | "error", msg: string, meta?: object) => void;

  maxDeliveries?: number;

  claimMinIdleMs?: number;

  claimIntervalMs?: number;

  onStats?: (stats: StreamStats) => void;

  statsIntervalMs?: number;
}

interface StreamCommands {
  xreadgroup(...args: unknown[]): Promise<unknown>;
  xautoclaim(...args: unknown[]): Promise<unknown>;
  xpending(...args: unknown[]): Promise<unknown>;
}

export class StreamBus implements EventBus {
  private readonly publisher: Valkey;
  private readonly subscriber: Valkey;

  private readonly pubStream: StreamCommands;
  private readonly defaultMaxLen: number;
  private readonly knownGroups = new Set<string>();
  private readonly log: NonNullable<StreamBusOptions["log"]>;
  private readonly maxDeliveries: number;
  private readonly claimMinIdleMs: number;
  private readonly claimIntervalMs: number;
  private readonly onStats: StreamBusOptions["onStats"];
  private readonly statsIntervalMs: number;
  private readonly timers = new Set<NodeJS.Timeout>();
  private readonly inFlight = new Set<string>();
  private closed = false;

  public constructor(opts: StreamBusOptions) {
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
    if (this.closed) throw new Error("StreamBus closed");
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
    for (const stream of streams) {
      await this.ensureGroup(stream, opts.group, opts.startId ?? "0");
    }

    const readConn = this.subscriber.duplicate() as unknown as StreamCommands & {
      quit(): Promise<string>;
      disconnect(): void;
    };

    let stopped = false;
    let loopDone: Promise<void> = Promise.resolve();
    const loop = async () => {
      while (!stopped && !this.closed) {

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
          const msg = String(err);
          this.log("error", "xreadgroup failed", { err: msg });
          if (msg.includes("NOGROUP")) {
            for (const stream of streams) {
              this.knownGroups.delete(`${stream}::${opts.group}`);
              try {
                await this.ensureGroup(stream, opts.group, opts.startId ?? "0");
              } catch (egErr) {
                this.log("error", "ensureGroup recovery failed", {
                  stream,
                  group: opts.group,
                  err: String(egErr),
                });
              }
            }
          }
          await Bun.sleep(500);
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

      await loopDone.catch(() => undefined);
      await readConn.quit().catch(() => readConn.disconnect());
    };
  }

  public async destroyGroup(stream: string, group: string): Promise<void> {
    try {
      await this.publisher.xgroup("DESTROY", stream, group);
    } catch (err) {
      this.log("warn", "xgroup destroy failed", {
        stream,
        group,
        err: String(err),
      });
    }
    this.knownGroups.delete(`${stream}::${group}`);
  }

  public close(): Promise<void> {
    this.closed = true;
    for (const t of this.timers) clearInterval(t);
    this.timers.clear();

    return Promise.resolve();
  }

  private async deliver<T>(
    stream: string,
    group: string,
    id: string,
    fields: string[],
    deliveryCount: number,
    handler: (msg: BusMessage<T>) => Promise<void>,
  ): Promise<void> {
    const inFlightKey = `${stream}\0${id}`;
    if (this.inFlight.has(inFlightKey)) return;
    this.inFlight.add(inFlightKey);

    try {

      if (deliveryCount > this.maxDeliveries) {
        try {
          await this.sendToDlq(stream, id, fields, deliveryCount);
        } catch (err) {
          this.log("error", "sendToDlq failed; leaving entry pending for retry", {
            stream,
            id,
            err: String(err),
          });
          return;
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
          this.log("error", "sendToDlq failed; leaving entry pending for retry", {
            stream,
            id,
            err: String(dlqErr),
          });
          return;
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

      try {
        await handler(msg);
      } catch (err) {
        this.log("error", "handler threw; leaving entry pending", {
          stream,
          id,
          deliveryCount,
          err: String(err),
        });
      }
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

      let cursor = "0-0";

      for (let i = 0; i < 8; i++) {
        let resp: [string, Array<[string, string[]]>, string[]?] | null = null;
        try {
          resp = (await this.pubStream.xautoclaim(
            stream,
            opts.group,
            opts.consumer,
            this.claimMinIdleMs,
            cursor,
            "COUNT",
            16,
          )) as [string, Array<[string, string[]]>, string[]?] | null;
        } catch (err) {
          if (String(err).includes("NOGROUP")) {
            this.knownGroups.delete(`${stream}::${opts.group}`);
            try {
              await this.ensureGroup(stream, opts.group, opts.startId ?? "0");
            } catch {
              // Ignore recovery error and rethrow so caller catches
            }
          }
          throw err;
        }
        if (!resp || !Array.isArray(resp)) break;
        const [nextCursor, entries] = resp;
        if (Array.isArray(entries)) {
          for (const [id, fields] of entries) {
            if (this.inFlight.has(`${stream}\0${id}`)) {
              this.log("warn", "skipping reclaim of in-flight message", {
                stream,
                id,
              });
              continue;
            }
            let deliveryCount: number;
            try {
              deliveryCount = await this.pendingDeliveryCount(
                stream,
                opts.group,
                id,
              );
            } catch (err) {
              this.log("error", "pendingDeliveryCount failed", {
                stream,
                id,
                err: String(err),
              });
              continue;
            }

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
        }
        if (!nextCursor || nextCursor === "0-0" || nextCursor === cursor) break;
        cursor = nextCursor;
      }
    }
  }

  private async pendingDeliveryCount(
    stream: string,
    group: string,
    id: string,
  ): Promise<number> {

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

    return Number(entry[3]) || 1;
  }

  private async sendToDlq(
    stream: string,
    id: string,
    fields: string[],
    deliveryCount: number,
  ): Promise<void> {
    const dlq = `${stream}:dlq`;
    const bIndex = fields.indexOf("b");
    const body =
      (bIndex !== -1 && bIndex % 2 === 0 ? fields[bIndex + 1] : fields[1]) ?? "";
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

      const resp = (await this.pubStream.xpending(stream, group)) as
        [number, ...unknown[]] | null;
      if (!resp) return 0;
      return Number(resp[0]) || 0;
    } catch {
      return 0;
    }
  }

  private async ensureGroup(
    stream: string,
    group: string,
    startId: string,
  ): Promise<void> {
    const key = `${stream}::${group}`;
    if (this.knownGroups.has(key)) return;
    try {
      await this.publisher.xgroup("CREATE", stream, group, startId, "MKSTREAM");
    } catch (err) {
      const msg = String(err);
      if (!msg.includes("BUSYGROUP")) throw err;
    }
    this.knownGroups.add(key);
  }
}

function decodeBody<T>(fields: string[]): T {

  for (let i = 0; i < fields.length; i += 2) {
    if (fields[i] === "b") return JSON.parse(fields[i + 1]!) as T;
  }
  throw new Error("StreamBus: message missing `b` field");
}
