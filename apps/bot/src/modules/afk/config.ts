import { z } from "zod";
import type { LumiServices } from "@lumi/bot-kit";

export const afkConfigSchema = z.object({
  nick_prefix_enabled: z.boolean().default(true),
});

export type AfkConfig = z.infer<typeof afkConfigSchema>;

export async function getAfkConfig(services: LumiServices, guildId: string): Promise<AfkConfig> {
  const raw = await services.db.config.getModuleConfig(guildId, "afk");
  return afkConfigSchema.parse(raw);
}
