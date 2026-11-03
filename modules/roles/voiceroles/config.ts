import type { ModuleServices } from "@lumi/module-kit";
import { z } from "zod";
import { readConfig } from "../shared.js";

export const VoiceRolesModuleName = "roles-voiceroles";
export const VoiceRolesConfigKey = VoiceRolesModuleName;

export const VoiceRolesConfigSchema = z.object({
  enabled: z.boolean().default(true),
  defaultGraceSeconds: z.number().int().min(0).max(86400).default(0),
});

export type VoiceRolesConfig = z.infer<typeof VoiceRolesConfigSchema>;

export function getVoiceRolesConfig(
  services: ModuleServices,
  guildId: string,
): Promise<VoiceRolesConfig> {
  return readConfig(
    services,
    guildId,
    VoiceRolesConfigKey,
    VoiceRolesConfigSchema,
    VoiceRolesModuleName,
  );
}
