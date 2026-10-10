import type { Container } from "@lumi/lib/services.js";
import { ReactionRoleMaxMenus } from "./constants.js";

export async function getMaxMenus(services: Container, guildId: string): Promise<number> {
  const value = await services.db.config.getModuleConfig(
    guildId,
    "reactionroles",
    "max_menus",
  );
  return typeof value === "number" ? value : ReactionRoleMaxMenus;
}
