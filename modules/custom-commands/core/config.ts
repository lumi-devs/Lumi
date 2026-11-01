import type { ModuleServices } from "@lumi/module-kit";
import { z } from "zod";
import { ConfigKey, ModuleName } from "./types.js";

export const CustomCommandsConfigSchema = z.object({
  enabled: z.boolean().default(true),
  prefixEnabled: z.boolean().default(true),
  prefix: z.string().min(1).max(8).default("!"),
  responseTimeoutMs: z.number().int().min(500).max(15_000).default(5_000),
  scheduleChannelId: z.string().nullable().default(null),
});

export type CustomCommandsConfig = z.infer<typeof CustomCommandsConfigSchema>;

export async function getCustomCommandsConfig(
  services: ModuleServices,
  guildId: string,
): Promise<CustomCommandsConfig> {
  const stored = await services.config.get(guildId, ConfigKey);
  const parsed = CustomCommandsConfigSchema.safeParse(stored ?? {});
  if (parsed.success) return parsed.data;

  services.observability?.logger?.warn?.(
    `[${ModuleName}] invalid configuration, using defaults`,
    { guildId, issues: parsed.error.issues },
  );
  return CustomCommandsConfigSchema.parse({});
}

export async function getMessagePrefix(
  services: ModuleServices,
  guildId: string,
  config: CustomCommandsConfig,
): Promise<string> {
  const stored = await services.config.get(guildId, "prefix");
  if (typeof stored === "string" && stored.length > 0) return stored;
  return config.prefix;
}
