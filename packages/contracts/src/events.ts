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

import { z } from "zod";
import { SnowflakeSchema, ModuleNameSchema, ConfigKeySchema } from "./rpc/schemas.js";

export const DashboardEventStream = "lumi:dashboard-events";

export const ModuleStateChangedEventSchema = z.object({
  type: z.literal("module.stateChanged"),
  v: z.literal(1),
  guildId: SnowflakeSchema,
  moduleName: ModuleNameSchema,
  enabled: z.boolean(),
  actorId: SnowflakeSchema,
  at: z.number(),
});

export const ConfigChangedEventSchema = z.object({
  type: z.literal("config.changed"),
  v: z.literal(1),
  guildId: SnowflakeSchema,
  moduleName: ModuleNameSchema,
  key: ConfigKeySchema,
  actorId: SnowflakeSchema,
  at: z.number(),
});

export const DashboardEventSchema = z.union([
  ModuleStateChangedEventSchema,
  ConfigChangedEventSchema,
]);

export type ModuleStateChangedEvent = z.infer<typeof ModuleStateChangedEventSchema>;
export type ConfigChangedEvent = z.infer<typeof ConfigChangedEventSchema>;
export type DashboardEvent = z.infer<typeof DashboardEventSchema>;
