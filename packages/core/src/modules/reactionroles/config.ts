import { container } from "@sapphire/framework";
import { ReactionRoleMaxMenus } from "./constants.js";

export async function getMaxMenus(guildId: string): Promise<number> {
  const value = await container.db.config.getModuleConfig(
    guildId,
    "reactionroles",
    "max_menus",
  );
  return typeof value === "number" ? value : ReactionRoleMaxMenus;
}
