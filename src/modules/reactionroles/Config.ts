import type { Container } from "@lib/Services.js";
import { ReactionRoleMaxMenus } from "@modules/reactionroles/Constants.js";

export async function getMaxMenus(services: Container, guildId: string): Promise<number> {
  const value = await services.db.config.getModuleConfig(
    guildId,
    "reactionroles",
    "max_menus",
  );
  return typeof value === "number" ? value : ReactionRoleMaxMenus;
}
