import type { ModuleServices } from "@lumi/module-kit";
import { z } from "zod";

export const ModuleName = "reminders";
export const ConfigKey = "reminders";

export const ReminderConfigSchema = z.object({
  enabled: z.boolean().default(true),
  maxPerUser: z.number().int().min(1).max(100).default(25),
  dmFallback: z.boolean().default(true),
  fallbackChannelId: z.string().nullable().optional(),
  retentionDays: z.number().int().min(1).max(365).default(30),
  allowRecurring: z.boolean().default(false),
});

export type ReminderConfig = z.infer<typeof ReminderConfigSchema>;

export async function readReminderConfig(
  services: ModuleServices,
  guildId: string,
): Promise<ReminderConfig> {
  let stored: unknown = null;
  try {
    stored = await services.config.get(guildId, ConfigKey);
  } catch (error) {
    services.observability?.logger?.warn?.("reminders config read failed", {
      guildId,
      error,
    });
    stored = null;
  }

  const parsed = ReminderConfigSchema.safeParse(stored ?? {});
  if (parsed.success) return parsed.data;

  services.observability?.logger?.warn?.(
    "[reminders] invalid configuration, using defaults",
    { guildId, issues: parsed.error.issues },
  );
  return ReminderConfigSchema.parse({});
}
