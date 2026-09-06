export const ModuleName = "reactionroles";

/** Button / select / modal custom-id prefix. Format: `rr:<action>:<menuId>[:<optionId>]`. */
export const Rr = "rr";

export const ReactionRoleKeys = {
  /** Guard so two staff members can't race a menu write. */
  menuWrite: (guildId: string, menuId: string) =>
    `lumi:reactionroles:write:${guildId}:${menuId}`,
} as const;
