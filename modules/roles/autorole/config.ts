import type { ModuleServices } from "@lumi/module-kit";
import { z } from "zod";
import { readConfig, saveConfig } from "../shared.js";

export const AutoroleModuleName = "roles-autorole";
export const AutoroleConfigKey = AutoroleModuleName;

export const AutoroleConfigSchema = z.object({
  enabled: z.boolean().default(true),
  paused: z.boolean().default(false),
  roleIds: z.array(z.string()).default([]),
  delaySeconds: z.number().int().min(0).max(604800).default(0),
  minAccountAgeHours: z.number().int().min(0).max(8760).default(0),
  requiredRoleIds: z.array(z.string()).default([]),
  ignoredRoleIds: z.array(z.string()).default([]),
  ignoreBots: z.boolean().default(true),
  onlyOnJoin: z.boolean().default(true),
});

export type AutoroleConfig = z.infer<typeof AutoroleConfigSchema>;

export function getAutoroleConfig(
  services: ModuleServices,
  guildId: string,
): Promise<AutoroleConfig> {
  return readConfig(
    services,
    guildId,
    AutoroleConfigKey,
    AutoroleConfigSchema,
    AutoroleModuleName,
  );
}

export function saveAutoroleConfig(
  services: ModuleServices,
  guildId: string,
  config: AutoroleConfig,
): Promise<boolean> {
  return saveConfig(services, guildId, AutoroleConfigKey, config);
}
