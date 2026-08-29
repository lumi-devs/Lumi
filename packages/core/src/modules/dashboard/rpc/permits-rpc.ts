import { registerRpcHandler, rpcHandlers } from "#lib/rpc/dispatch.js";
import { RPC_ACTIONS } from "@lumi/contracts";
import { getService } from "#lib/module-system/Service.js";
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
  registerRpcHandler(RPC_ACTIONS.guildPermitsList, async (req) => {
    const { guildId } = await verifyGuildAccess(req);
    const permits = await getService("permissions").listPermits(guildId);
    return { permits };
  });

  registerRpcHandler(RPC_ACTIONS.guildPermitsCreate, async (req) => {
    const guildId = requireGuildId(req.guildId);
    await requireGuildManager(guildId, req.actorId);
    const { name, kind, nodes } = parsePayload(PermitCreateSchema, req.data);
    const permit = await getService("permissions").createPermit(
      guildId,
      name,
      kind,
      nodes,
    );
    return { success: true, permit };
  });

  registerRpcHandler(RPC_ACTIONS.guildPermitsUpdate, async (req) => {
    const { guildId } = await verifyGuildAccess(req);
    const { permitId, name, nodes } = parsePayload(
      PermitUpdateSchema,
      req.data,
    );
    const perms = getService("permissions");
    if (name !== undefined) await perms.renamePermit(guildId, permitId, name);
    const permit =
      nodes !== undefined
        ? await perms.updatePermitNodes(guildId, permitId, nodes)
        : await perms.getPermit(guildId, permitId);
    return { success: true, permit };
  });

  registerRpcHandler(RPC_ACTIONS.guildPermitsDelete, async (req) => {
    const guildId = requireGuildId(req.guildId);
    await requireGuildManager(guildId, req.actorId);
    const { permitId } = parsePayload(PermitDeleteSchema, req.data);
    await getService("permissions").deletePermit(guildId, permitId);
    return { success: true };
  });

  registerRpcHandler(RPC_ACTIONS.guildPermitsAssign, async (req) => {
    const guildId = requireGuildId(req.guildId);
    await requireGuildManager(guildId, req.actorId);
    const { permitId, targetType, targetId } = parsePayload(
      PermitAssignSchema,
      req.data,
    );
    await getService("permissions").assignPermit(
      guildId,
      permitId,
      targetType,
      targetId,
    );
    return { success: true };
  });

  registerRpcHandler(RPC_ACTIONS.guildPermitsUnassign, async (req) => {
    const guildId = requireGuildId(req.guildId);
    await requireGuildManager(guildId, req.actorId);
    const { permitId, targetType, targetId } = parsePayload(
      PermitAssignSchema,
      req.data,
    );
    await getService("permissions").unassignPermit(
      guildId,
      permitId,
      targetType,
      targetId,
    );
    return { success: true };
  });
}

export function unregisterPermitsRpcHandlers(): void {
  rpcHandlers.delete(RPC_ACTIONS.guildPermitsList);
  rpcHandlers.delete(RPC_ACTIONS.guildPermitsCreate);
  rpcHandlers.delete(RPC_ACTIONS.guildPermitsUpdate);
  rpcHandlers.delete(RPC_ACTIONS.guildPermitsDelete);
  rpcHandlers.delete(RPC_ACTIONS.guildPermitsAssign);
  rpcHandlers.delete(RPC_ACTIONS.guildPermitsUnassign);
}
