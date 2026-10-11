import type { Container } from "#src/lib/Services.js";
import { ReactionRoleMaxMenus } from "#src/modules/reactionroles/Constants.js";

export async function getMaxMenus(services: Container, guildId: string): Promise<number> {
  const value = await services.db.config.getModuleConfig(
    guildId,
    "reactionroles",
    "max_menus",
  );
  return typeof value === "number" ? value : ReactionRoleMaxMenus;
}
