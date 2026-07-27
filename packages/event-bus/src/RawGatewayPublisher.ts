// Gateway-side hook: every raw Discord dispatch packet handled by the local
// discord.js client is also published to the bus, partitioned by guild_id so a
// guild's events stay ordered through the consumer group. Wrapping
// `client.ws.handlePacket` keeps the publish fire-and-forget alongside local
// dispatch, so the worker can run TRANSPORT=streams while keeping its own
// listeners (useful for shadow-traffic validation). The dedicated gateway app uses
// `RawGatewayProxyPublisher` below instead — no Sapphire, publish-only.

import type { EventBus } from "./types.js";
import {
  rawGatewayStream,
  type RawGatewayEnvelope,
  type RawGatewayPacket,
} from "@lumi/contracts";
import { injectTraceContext } from "@lumi/observability";

interface DjsShardLike {
  id: number;
}

interface DjsClientLike {
  ws: {
    handlePacket: (packet: unknown, shard: DjsShardLike) => boolean;
  };
}

export interface RawGatewayPublisherOptions {
  /** Skip publishing these dispatch types (case-sensitive Discord names). */
  ignoreDispatchTypes?: ReadonlySet<string>;
  /** Per-stream MAXLEN override (passed through to bus.publish). */
  maxLen?: number;
  log?: (level: "warn" | "error", msg: string, meta?: object) => void;
}

export class RawGatewayPublisher {
  private attached = false;
  private original?: DjsClientLike["ws"]["handlePacket"];
  private readonly ignore: ReadonlySet<string>;
  private readonly log: NonNullable<RawGatewayPublisherOptions["log"]>;

  public constructor(
    private readonly bus: EventBus,
    private readonly client: DjsClientLike,
    private readonly opts: RawGatewayPublisherOptions = {},
  ) {
    this.ignore = opts.ignoreDispatchTypes ?? new Set();
    this.log = opts.log ?? (() => undefined);
  }

  /** Wrap handlePacket. Idempotent — second call is a no-op. */
  public attach(): void {
    if (this.attached) return;
    const original = this.client.ws.handlePacket.bind(this.client.ws);
    this.original = original;
    // Arrow keeps `this` lexically bound to the publisher (no `self` alias);
    // `original` is already bound to the ws manager, so the patched fn never
    // needs its own `this`.
    this.client.ws.handlePacket = (packet, shard) => {
      // Publish only DISPATCH packets we know how to identify; other ops
      // (HELLO, HEARTBEAT_ACK, RECONNECT, etc.) are connection bookkeeping
      // discord.js handles internally and the worker doesn't reconstruct.
      const p = packet as RawGatewayPacket | undefined;
      if (p?.op === 0 && typeof p.t === "string" && !this.ignore.has(p.t)) {
        const guildId = extractGuildId(p.d);
        const envelope: RawGatewayEnvelope = {
          shardId: shard.id,
          packet: p,
          ts: Date.now(),
          guildId,
          ...injectTraceContext(),
        };
        const stream = rawGatewayStream(p.t);
        this.bus
          .publish(stream, envelope, { maxLen: this.opts.maxLen })
          .catch((err) =>
            this.log("error", "raw-gateway publish failed", {
              stream,
              err: String(err),
            }),
          );
      }
      return original(packet, shard);
    };
    this.attached = true;
  }

  /** Restore the original handlePacket. */
  public detach(): void {
    if (!this.attached || !this.original) return;
    this.client.ws.handlePacket = this.original;
    this.attached = false;
  }
}

function extractGuildId(d: unknown): string | undefined {
  if (typeof d !== "object" || d === null) return undefined;
  const v = (d as { guild_id?: unknown }).guild_id;
  return typeof v === "string" ? v : undefined;
}

/**
 * Proxy-mode publisher. Hooks `@discordjs/ws` `WebSocketManager`
 * directly via the `Dispatch` event — no discord.js `Client`, no entity
 * managers, no caches. Used by `apps/gateway` once the proxy cutover lands.
 *
 * Same envelope shape as `RawGatewayPublisher`; the worker side
 * (`RawGatewayConsumer`) is identical.
 */
export interface AttachProxyPublisherOptions extends RawGatewayPublisherOptions {
  /** Override dispatch event name. Defaults to "dispatch". */
  dispatchEvent?: string;
}

interface DispatchEmitterLike {
  on(
    event: string,
    listener: (payload: RawGatewayPacket, shardId: number) => void,
  ): unknown;
  off(
    event: string,
    listener: (payload: RawGatewayPacket, shardId: number) => void,
  ): unknown;
}

export function attachProxyPublisher(
  bus: EventBus,
  manager: DispatchEmitterLike,
  opts: AttachProxyPublisherOptions = {},
): () => void {
  const ignore = opts.ignoreDispatchTypes ?? new Set();
  const log = opts.log ?? (() => undefined);
  const event = opts.dispatchEvent ?? "dispatch";
  const listener = (data: RawGatewayPacket, shardId: number) => {
    // WebSocketManager only emits this event for op=0 dispatches, so we don't
    // re-check op here; trust `data.t` to be present.
    if (!data?.t || typeof data.t !== "string" || ignore.has(data.t)) return;
    const guildId = extractGuildId(data.d);
    const envelope: RawGatewayEnvelope = {
      shardId,
      packet: data,
      ts: Date.now(),
      guildId,
      ...injectTraceContext(),
    };
    const stream = rawGatewayStream(data.t);
    bus.publish(stream, envelope, { maxLen: opts.maxLen }).catch((err) =>
      log("error", "raw-gateway publish failed", {
        stream,
        err: String(err),
      }),
    );
  };
  manager.on(event, listener);
  return () => {
    manager.off(event, listener);
  };
}
