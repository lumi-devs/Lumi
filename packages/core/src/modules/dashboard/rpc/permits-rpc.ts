import { registerRpcHandler, rpcHandlers } from "#lib/rpc/dispatch.js";
import { RpcActions } from "@lumi/contracts";
import { getUtility } from "#lib/module-system/Utility.js";
import {
  PermitAssignSchema,
  PermitCreateSchema,
  PermitDeleteSchema,
  PermitUpdateSchema,
  parsePayload,
  requireGuildId,
  requireGuildManager,
  verifyGuildAccess,
} from "../lib/helpers.js";

export function registerPermitsRpcHandlers(): void {
  registerRpcHandler(RpcActions.guildPermitsList, async (req) => {
    const { guildId } = await verifyGuildAccess(req);
    const permits = await getUtility("permissions").listPermits(guildId);
    return { permits };
  });

  registerRpcHandler(RpcActions.guildPermitsCreate, async (req) => {
    const guildId = requireGuildId(req.guildId);
    await requireGuildManager(guildId, req.actorId);
    const { name, kind, nodes } = parsePayload(PermitCreateSchema, req.data);
    const permit = await getUtility("permissions").createPermit(
      guildId,
      name,
      kind,
      nodes,
    );
    return { success: true, permit };
  });

  registerRpcHandler(RpcActions.guildPermitsUpdate, async (req) => {
    const { guildId } = await verifyGuildAccess(req);
    const { permitId, name, nodes } = parsePayload(
      PermitUpdateSchema,
      req.data,
    );
    const perms = getUtility("permissions");
    if (name !== undefined) await perms.renamePermit(guildId, permitId, name);
    const permit =
      nodes !== undefined
        ? await perms.updatePermitNodes(guildId, permitId, nodes)
        : await perms.getPermit(guildId, permitId);
    return { success: true, permit };
  });

  registerRpcHandler(RpcActions.guildPermitsDelete, async (req) => {
    const guildId = requireGuildId(req.guildId);
    await requireGuildManager(guildId, req.actorId);
    const { permitId } = parsePayload(PermitDeleteSchema, req.data);
    await getUtility("permissions").deletePermit(guildId, permitId);
    return { success: true };
  });

  registerRpcHandler(RpcActions.guildPermitsAssign, async (req) => {
    const guildId = requireGuildId(req.guildId);
    await requireGuildManager(guildId, req.actorId);
    const { permitId, targetType, targetId } = parsePayload(
      PermitAssignSchema,
      req.data,
    );
    await getUtility("permissions").assignPermit(
      guildId,
      permitId,
      targetType,
      targetId,
    );
    return { success: true };
  });

  registerRpcHandler(RpcActions.guildPermitsUnassign, async (req) => {
    const guildId = requireGuildId(req.guildId);
    await requireGuildManager(guildId, req.actorId);
    const { permitId, targetType, targetId } = parsePayload(
      PermitAssignSchema,
      req.data,
    );
    await getUtility("permissions").unassignPermit(
      guildId,
      permitId,
      targetType,
      targetId,
    );
    return { success: true };
  });
}

export function unregisterPermitsRpcHandlers(): void {
  rpcHandlers.delete(RpcActions.guildPermitsList);
  rpcHandlers.delete(RpcActions.guildPermitsCreate);
  rpcHandlers.delete(RpcActions.guildPermitsUpdate);
  rpcHandlers.delete(RpcActions.guildPermitsDelete);
  rpcHandlers.delete(RpcActions.guildPermitsAssign);
  rpcHandlers.delete(RpcActions.guildPermitsUnassign);
}
