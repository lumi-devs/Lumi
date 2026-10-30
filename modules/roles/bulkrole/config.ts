import type { ModuleServices } from "@lumi/module-kit";
import { z } from "zod";
import { readConfig, saveConfig } from "../shared.js";

export const BulkRoleModuleName = "roles-bulkrole";
export const BulkRoleConfigKey = BulkRoleModuleName;

export const BulkRoleConfigSchema = z.object({
  enabled: z.boolean().default(true),
  batchSize: z.number().int().min(1).max(500).default(50),
});

export type BulkRoleConfig = z.infer<typeof BulkRoleConfigSchema>;

export function getBulkRoleConfig(
  services: ModuleServices,
  guildId: string,
): Promise<BulkRoleConfig> {
  return readConfig(
    services,
    guildId,
    BulkRoleConfigKey,
    BulkRoleConfigSchema,
    BulkRoleModuleName,
  );
}

export function saveBulkRoleConfig(
  services: ModuleServices,
  guildId: string,
  config: BulkRoleConfig,
): Promise<boolean> {
  return saveConfig(services, guildId, BulkRoleConfigKey, config);
}
