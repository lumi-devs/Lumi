import { Module, DefineModule, cfg } from "#lib/module-system/Module.js";
import { container } from "@sapphire/framework";
import { ModuleName } from "./keys.js";

export const ReactionRoleMaxMenus = 25;

export async function getMaxMenus(guildId: string): Promise<number> {
  const value = await container.db.config.getModuleConfig(
    guildId,
    "reactionroles",
    "max_menus",
  );
  return typeof value === "number" ? value : ReactionRoleMaxMenus;
}

@DefineModule({
  name: ModuleName,
  displayName: "Reaction Roles",
  emoji: "🎭",
  description:
    "Self-serve role menus with buttons, a multi-pick dropdown, or raw message reactions, including exclusive and gated options.",
  short: "Self-serve role menus via buttons, dropdown, or reactions.",
  endUserDataStatement:
    "Stores role-menu definitions (titles, role IDs, gates) per server. Role assignments themselves live on Discord and are removed by unassigning the role.",
  category: "Community",
  dashboardHref: "config/roles",
  configSchema: cfg.object({
    max_menus: cfg.number({
      label: "Max Role Menus",
      description: "How many role menus can exist in this server at once.",
      default: 25,
      min: 1,
      max: 25,
    }),
  }),
})
export class ReactionRolesModule extends Module {}
