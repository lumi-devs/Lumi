// Discord gateway dispatch packet envelope contracts for event bus transport.


export interface RawGatewayPacket {
  /** Gateway opcode (always `0` / DISPATCH for the packets we forward). */
  op: number;
  /** Sequence number from Discord. */
  s: number | null;
  /** Dispatch event name, e.g. `MESSAGE_CREATE`. Null for non-dispatch ops. */
  t: string | null;
  /** Event-specific payload. Discord guarantees this is plain JSON. */
  d: unknown;
}

export interface RawGatewayEnvelope {
  /** Discord shard id the packet came from. */
  shardId: number;
  /** The raw dispatch packet as discord.js produced it. */
  packet: RawGatewayPacket;
  /** ms epoch when the gateway received the packet. */
  ts: number;
  /** W3C trace context so the worker continues the same trace. */
  traceparent?: string;
  tracestate?: string;
  /** Partition hint (guild_id when present) so a guild's events stay ordered. */
  guildId?: string;
}

/** Stream name per dispatch type — keeps fan-out and per-type backpressure independent. */
export const rawGatewayStream = (eventType: string) =>
  `lumi:gw:${eventType.toLowerCase()}`;

/** Single consumer group for the worker pool. */
export const RAW_GATEWAY_CONSUMER_GROUP = "lumi-workers";
