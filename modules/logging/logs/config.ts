import type { ModuleServices } from "@lumi/module-kit";
import { z } from "zod";

export const LoggingConfigSchema = z.object({
  messageLogChannel: z.string().nullable().optional(),
  editLogChannel: z.string().nullable().optional(),
  deleteLogChannel: z.string().nullable().optional(),
  voiceLogChannel: z.string().nullable().optional(),
  ignoredChannels: z.array(z.string()).default([]),
});

export type LoggingConfig = z.infer<typeof LoggingConfigSchema>;

export const LoggingConfigKey = "logging";

export const isLoggingEnabled = (
  services: ModuleServices,
  guildId: string,
): boolean => services.modules.isEnabled(guildId, LoggingConfigKey);

export async function getLoggingConfig(
  services: ModuleServices,
  guildId: string,
): Promise<LoggingConfig> {
  const stored = await services.config.get(guildId, LoggingConfigKey);
  const parsed = LoggingConfigSchema.safeParse(stored ?? {});
  if (parsed.success) return parsed.data;

  services.observability?.logger?.warn?.(
    "[logging] invalid configuration, using defaults",
    { guildId, issues: parsed.error.issues },
  );
  return LoggingConfigSchema.parse({});
}
