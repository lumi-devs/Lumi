export const RoleMenuCustomIdPrefix = "lumi:rolemenu";

export type RoleMenuComponent =
  | {
      readonly kind: "button";
      readonly groupId: string;
      readonly optionId: string;
    }
  | { readonly kind: "select"; readonly groupId: string };

export const RoleMenuIds = {
  button(groupId: string, optionId: string): string {
    return `${RoleMenuCustomIdPrefix}:button:${groupId}:${optionId}`;
  },
  select(groupId: string): string {
    return `${RoleMenuCustomIdPrefix}:select:${groupId}`;
  },
  parse(customId: string): RoleMenuComponent | null {
    if (!customId.startsWith(`${RoleMenuCustomIdPrefix}:`)) return null;
    const [prefix, kind, groupId, optionId] = customId.split(":");
    if (prefix !== "lumi" || !groupId) return null;
    if (kind === "button" && optionId) {
      return { kind, groupId, optionId };
    }
    if (kind === "select") {
      return { kind, groupId };
    }
    return null;
  },
};
