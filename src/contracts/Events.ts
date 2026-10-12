import { z } from "zod";
import { SnowflakeSchema, ModuleNameSchema, ConfigKeySchema } from "#src/contracts/rpc/Schemas.js";

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
