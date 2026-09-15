import { clampMessageDocumentV2 } from "@lumi/contracts";
import { reactionrolesRpc } from "@lumi/contracts/rpc";
import { getUtility } from "#lib/module-system/Utility.js";
import { implementRpc } from "#lib/rpc/implement.js";
import type { ReactionRoleMenu } from "./data.js";

function toView(menu: ReactionRoleMenu) {
  return {
    id: menu.id,
    title: menu.title,
    description: menu.description,
    color: menu.color,
    mode: menu.mode,
    exclusive: menu.exclusive,
    maxRoles: menu.maxRoles,
    channelId: menu.channelId,
    messageIds: menu.messageIds,
    options: menu.options,
    richContent: menu.richContent,
    createdAt: new Date(menu.createdAt).toISOString(),
    updatedAt: new Date(menu.updatedAt).toISOString(),
  };
}

export const reactionrolesRpcHandlers = implementRpc(reactionrolesRpc, {
  "guild.reactionroles.menus.list": async ({ guildId }) => {
    const menus = await getUtility("reactionroles").listMenus(guildId);
    return { menus: menus.map(toView) };
  },

  "guild.reactionroles.menus.set": async ({ guildId, input }) => {
    const service = getUtility("reactionroles");
    const existing = await service.getMenu(guildId, input.id);
    const options = input.options.map((o) => ({
      id: o.id,
      label: o.label,
      emoji: o.emoji ?? null,
      description: o.description ?? null,
      roleId: o.roleId,
      requiredRoleId: o.requiredRoleId ?? null,
    }));

    const fields = {
      title: input.title,
      description: input.description ?? null,
      color: input.color ?? null,
      mode: input.mode,
      exclusive: input.exclusive ?? false,
      maxRoles: input.maxRoles ?? 1,
      richContent: clampMessageDocumentV2(input.richContent),
    };
    const menu = existing
      ? await service.updateMenu(guildId, input.id, fields)
      : await service.createMenu(guildId, fields);

    const currentIds = new Set(menu.options.map((o) => o.id));
    const wantedIds = new Set(
      options.map((o, i) => o.id ?? menu.options[i]?.id ?? `option-${i + 1}`),
    );
    for (const stale of [...currentIds].filter((id) => !wantedIds.has(id))) {
      await service.removeOption(guildId, menu.id, stale);
    }
    let synced = await service.getMenu(guildId, menu.id);
    if (!synced) throw new Error("That role menu no longer exists.");
    for (let i = 0; i < options.length; i++) {
      const wanted = options[i]!;
      const match =
        (wanted.id && synced.options.find((o) => o.id === wanted.id)) ??
        synced.options.find((o) => o.roleId === wanted.roleId);
      if (match) {
        synced = await service.editOption(guildId, menu.id, match.id, wanted);
      } else {
        synced = await service.addOption(guildId, menu.id, wanted);
      }
    }
    const finalMenu = await service.getMenu(guildId, menu.id);
    if (!finalMenu) throw new Error("That role menu no longer exists.");
    return { success: true, menu: toView(finalMenu) };
  },

  "guild.reactionroles.menus.delete": async ({ guildId, input }) => {
    const deleted = await getUtility("reactionroles").deleteMenu(guildId, input.id);
    return { success: true, id: input.id, deleted };
  },
});
