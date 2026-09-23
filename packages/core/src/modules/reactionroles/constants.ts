import { defineCustomId } from "#lib/interactions/custom-id.js";

export const ReactionRoleMaxMenus = 25;

export const ModuleName = "reactionroles";

/** Button / select / modal custom-id prefix. Format: `rr:<action>:<menuId>[:<optionId>]`. */
const Rr = "rr";

export const ReactionRolePickId = defineCustomId(`${Rr}:pick`, ["menuId", "optionId"]);
export const ReactionRoleSelectId = defineCustomId(`${Rr}:select`, ["menuId"]);

export const ReactionRoleKeys = {
  /** Guard so two staff members can't race a menu write. */
  menuWrite: (guildId: string, menuId: string) =>
    `lumi:reactionroles:write:${guildId}:${menuId}`,
} as const;
