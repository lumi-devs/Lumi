import { registerRpcHandler, rpcHandlers } from "#lib/rpc/dispatch.js";
import { RpcActions } from "@lumi/contracts";
import { getUtility } from "#lib/module-system/Utility.js";
import {
  ReactionRoleMenuDeleteSchema,
  ReactionRoleMenuSetSchema,
  parsePayload,
  requireGuildId,
  requireGuildManager,
} from "#lib/rpc/helpers.js";

function reactionRoles() {
  return getUtility("reactionroles");
}

function toView(menu: {
  id: string;
  title: string;
  description: string | null;
  color: string | null;
  mode: string;
  exclusive: boolean;
  maxRoles: number;
  channelId: string | null;
  messageIds: string[];
  options: {
    id: string;
    label: string;
    emoji: string | null;
    description: string | null;
    roleId: string;
    requiredRoleId: string | null;
  }[];
  createdAt: number;
  updatedAt: number;
}) {
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
    createdAt: new Date(menu.createdAt).toISOString(),
    updatedAt: new Date(menu.updatedAt).toISOString(),
  };
}

export function registerReactionRolesRpcHandlers(): void {
  registerRpcHandler(RpcActions.guildReactionRoleMenusList, async (req) => {
    const guildId = requireGuildId(req.guildId);
    await requireGuildManager(guildId, req.actorId);
    const menus = await reactionRoles().listMenus(guildId);
    return { menus: menus.map(toView) };
  });

  registerRpcHandler(RpcActions.guildReactionRoleMenuSet, async (req) => {
    const guildId = requireGuildId(req.guildId);
    await requireGuildManager(guildId, req.actorId);
    const payload = parsePayload(ReactionRoleMenuSetSchema, req.data);
    const service = reactionRoles();

    const existing = await service.getMenu(guildId, payload.id);
    const options = payload.options.map((o) => ({
      id: o.id,
      label: o.label,
      emoji: o.emoji ?? null,
      description: o.description ?? null,
      roleId: o.roleId,
      requiredRoleId: o.requiredRoleId ?? null,
    }));

    const menu = existing
      ? await service.updateMenu(guildId, payload.id, {
          title: payload.title,
          description: payload.description ?? null,
          color: payload.color ?? null,
          mode: payload.mode,
          exclusive: payload.exclusive ?? false,
          maxRoles: payload.maxRoles ?? 1,
        })
      : await service.createMenu(guildId, {
          title: payload.title,
          description: payload.description ?? null,
          color: payload.color ?? null,
          mode: payload.mode,
          exclusive: payload.exclusive ?? false,
          maxRoles: payload.maxRoles ?? 1,
        });

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
  });

  registerRpcHandler(RpcActions.guildReactionRoleMenuDelete, async (req) => {
    const guildId = requireGuildId(req.guildId);
    await requireGuildManager(guildId, req.actorId);
    const { id } = parsePayload(ReactionRoleMenuDeleteSchema, req.data);
    const deleted = await reactionRoles().deleteMenu(guildId, id);
    return { success: true, id, deleted };
  });
}

export function unregisterReactionRolesRpcHandlers(): void {
  rpcHandlers.delete(RpcActions.guildReactionRoleMenusList);
  rpcHandlers.delete(RpcActions.guildReactionRoleMenuSet);
  rpcHandlers.delete(RpcActions.guildReactionRoleMenuDelete);
}
