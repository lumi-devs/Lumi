import type { LumiServices } from "@lumi/module-kit";
import { modConfigSchema, type ModConfig } from "../config.ts";

export async function getModConfig(services: LumiServices, guildId: string): Promise<ModConfig> {
  const raw = await services.db.config.getModuleConfig(guildId, "mod");
  return modConfigSchema.parse(raw);
}
