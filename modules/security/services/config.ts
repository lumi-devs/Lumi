import type { LumiServices } from "@lumi/module-kit";
import { securityConfigSchema, type SecurityConfig } from "../config.ts";

export async function getSecurityConfig(
  services: LumiServices,
  guildId: string,
): Promise<SecurityConfig> {
  const raw = await services.db.config.getModuleConfig(guildId, "security");
  return securityConfigSchema.parse(raw);
}
