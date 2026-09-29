/**
 * Dashboard-facing realtime events, published onto the Redis Streams event
 * bus (`packages/core/src/lib/event-bus/`) at the single mutation site each
 * one represents, and consumed by `apps/api`'s SSE endpoint
 * (`packages/core/src/lib/rpc/sse-server.ts`).
 *
 * One shared stream rather than one per event type: the SSE endpoint gives
 * each connection its own ephemeral consumer group (so every dashboard tab
 * gets every event, not a competing-consumer split), and a per-connection
 * group already pays a Redis round-trip per XREADGROUP - multiplying that by
 * per-event-type streams buys nothing at today's volume. Split it if a
 * genuinely hot event type needs its own MAXLEN/backpressure budget.
 */

export const DashboardEventStream = "lumi:dashboard-events";

export interface ModuleStateChangedEvent {
  type: "module.stateChanged";
  guildId: string;
  moduleName: string;
  enabled: boolean;
  actorId: string;
  at: number;
}

export interface ConfigChangedEvent {
  type: "config.changed";
  guildId: string;
  moduleName: string;
  key: string;
  actorId: string;
  at: number;
}

export type DashboardEvent = ModuleStateChangedEvent | ConfigChangedEvent;
