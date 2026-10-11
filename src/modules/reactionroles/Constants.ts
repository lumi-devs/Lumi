import { defineCustomId } from "#src/lib/interactions/CustomId.js";

export const ReactionRoleMaxMenus = 25;

export const ModuleName = "reactionroles";

const Rr = "rr";

export const ReactionRolePickId = defineCustomId(`${Rr}:pick`, ["menuId", "optionId"]);
export const ReactionRoleSelectId = defineCustomId(`${Rr}:select`, ["menuId"]);

export const ReactionRoleKeys = {

  menuWrite: (guildId: string, menuId: string) =>
    `lumi:reactionroles:write:${guildId}:${menuId}`,
} as const;
