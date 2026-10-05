/**
 * Dashboard-facing realtime events, published onto the Valkey Streams event
 * bus (`packages/core/src/lib/event-bus/`) at the single mutation site each
 * one represents, and consumed by `apps/api`'s SSE endpoint
 * (`packages/core/src/lib/rpc/sse-server.ts`).
 *
 * One shared stream rather than one per event type: the SSE endpoint gives
 * each connection its own ephemeral consumer group (so every dashboard tab
 * gets every event, not a competing-consumer split), and a per-connection
 * group already pays a Valkey round-trip per XREADGROUP - multiplying that by
 * per-event-type streams buys nothing at today's volume. Split it if a
 * genuinely hot event type needs its own MAXLEN/backpressure budget.
 *
 * These events are a best-effort live-UI hint, not a durable audit trail -
 * the database stays the source of truth for everything they describe.
 */

import { s, type Type } from "@sapphire/shapeshift";
import { SnowflakeSchema, ModuleNameSchema, ConfigKeySchema } from "./rpc/schemas.js";

export const DashboardEventStream = "lumi:dashboard-events";

export const ModuleStateChangedEventSchema = s.object({
  type: s.literal("module.stateChanged"),
  v: s.literal(1),
  guildId: SnowflakeSchema,
  moduleName: ModuleNameSchema,
  enabled: s.boolean(),
  actorId: SnowflakeSchema,
  at: s.number(),
});

export const ConfigChangedEventSchema = s.object({
  type: s.literal("config.changed"),
  v: s.literal(1),
  guildId: SnowflakeSchema,
  moduleName: ModuleNameSchema,
  key: ConfigKeySchema,
  actorId: SnowflakeSchema,
  at: s.number(),
});

export const DashboardEventSchema = s.union([
  ModuleStateChangedEventSchema,
  ConfigChangedEventSchema,
]);

export type ModuleStateChangedEvent = Type<typeof ModuleStateChangedEventSchema>;
export type ConfigChangedEvent = Type<typeof ConfigChangedEventSchema>;
export type DashboardEvent = Type<typeof DashboardEventSchema>;
