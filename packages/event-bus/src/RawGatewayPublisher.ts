// Gateway-side hook: every raw Discord dispatch packet handled by the local
// discord.js client is also published to the bus, partitioned by guild_id so
// a guild's events stay ordered through the consumer group.
//
// In slice 1 we hook by wrapping `client.ws.handlePacket` so the publish is
// fire-and-forget alongside local dispatch — this lets the monolith run with
// TRANSPORT=streams *and* keep its own listeners, useful for shadow-traffic
// validation before flipping the worker to consume-only.
//
// In a future slice the dedicated gateway app won't load Sapphire at all and
// `handlePacket` will only publish (local dispatch becomes a no-op).

import type { EventBus } from "./types.js";
import {
  rawGatewayStream,
  type RawGatewayEnvelope,
  type RawGatewayPacket,
} from "@ember/contracts";
import { injectTraceContext } from "@ember/observability";

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
    const self = this;
    this.client.ws.handlePacket = function patched(packet, shard) {
      // Publish only DISPATCH packets we know how to identify; other ops
      // (HELLO, HEARTBEAT_ACK, RECONNECT, etc.) are connection bookkeeping
      // discord.js handles internally and the worker doesn't reconstruct.
      const p = packet as RawGatewayPacket | undefined;
      if (p?.op === 0 && p.t && !self.ignore.has(p.t)) {
        const guildId = extractGuildId(p.d);
        const envelope: RawGatewayEnvelope = {
          shardId: shard.id,
          packet: p,
          ts: Date.now(),
          guildId,
          ...injectTraceContext(),
        };
        const stream = rawGatewayStream(p.t);
        self.bus
          .publish(stream, envelope, { maxLen: self.opts.maxLen })
          .catch((err) =>
            self.log("error", "raw-gateway publish failed", {
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
