// Worker-side: consume raw gateway envelopes from the bus and replay each
// packet into a local discord.js client's dispatcher. The worker never
// connects to the gateway itself — `client.ws.handlePacket` is driven by
// the consumer loop instead.
//
// `shard` discord.js wants is a `WebSocketShard` instance from its own
// internals, but in practice handlePacket only reads `shard.id`. We pass a
// synthetic with the id from the envelope.

import { extractTraceContext, otelContext } from "@lumi/observability";
import { context as otelApiContext } from "@opentelemetry/api";
import {
  RAW_GATEWAY_CONSUMER_GROUP,
  rawGatewayStream,
  type RawGatewayEnvelope,
} from "@lumi/contracts";
import type { BusMessage, EventBus } from "./types.js";

interface DjsClientLike {
  ws: {
    handlePacket: (packet: unknown, shard: { id: number }) => boolean;
  };
}

export interface RawGatewayConsumerOptions {
  /** Dispatch types to subscribe to. Default: a conservative core set. */
  dispatchTypes?: readonly string[];
  /** Stable per-worker id. Survives restarts so XPENDING claims its own pending msgs. */
  consumerId: string;
  /** Consumer group; defaults to the canonical lumi worker pool. */
  group?: string;
  blockMs?: number;
  batchSize?: number;
  log?: (level: "info" | "warn" | "error", msg: string, meta?: object) => void;
}

/** Conservative default: enough to drive command/listener flows. */
export const DEFAULT_RAW_DISPATCH_TYPES = [
  "READY",
  "RESUMED",
  "GUILD_CREATE",
  "GUILD_UPDATE",
  "GUILD_DELETE",
  "MESSAGE_CREATE",
  "MESSAGE_UPDATE",
  "MESSAGE_DELETE",
  "INTERACTION_CREATE",
  "GUILD_MEMBER_ADD",
  "GUILD_MEMBER_UPDATE",
  "GUILD_MEMBER_REMOVE",
  "CHANNEL_CREATE",
  "CHANNEL_UPDATE",
  "CHANNEL_DELETE",
  "VOICE_STATE_UPDATE",
] as const;

export class RawGatewayConsumer {
  private stop?: () => Promise<void>;

  public constructor(
    private readonly bus: EventBus,
    private readonly client: DjsClientLike,
    private readonly opts: RawGatewayConsumerOptions,
  ) {}

  public async start(): Promise<void> {
    const types = this.opts.dispatchTypes ?? DEFAULT_RAW_DISPATCH_TYPES;
    const streams = types.map((t) => rawGatewayStream(t));
    this.stop = await this.bus.consume<RawGatewayEnvelope>(
      streams,
      {
        group: this.opts.group ?? RAW_GATEWAY_CONSUMER_GROUP,
        consumer: this.opts.consumerId,
        blockMs: this.opts.blockMs,
        batchSize: this.opts.batchSize,
      },
      (msg) => this.handle(msg),
    );
  }

  public async stopConsuming(): Promise<void> {
    await this.stop?.();
    this.stop = undefined;
  }

  private async handle(msg: BusMessage<RawGatewayEnvelope>): Promise<void> {
    const env = msg.body;
    const ctx = env.traceparent
      ? extractTraceContext({
          traceparent: env.traceparent,
          tracestate: env.tracestate,
        })
      : otelContext.active();
    try {
      await otelApiContext.with(ctx, () => {
        this.client.ws.handlePacket(env.packet, { id: env.shardId });
      });
      await msg.ack();
    } catch (err) {
      this.opts.log?.("error", "raw-gateway dispatch failed", {
        id: msg.id,
        t: env.packet.t,
        err: String(err),
      });
      // Leave pending — the XAUTOCLAIM loop will surface it.
    }
  }
}
