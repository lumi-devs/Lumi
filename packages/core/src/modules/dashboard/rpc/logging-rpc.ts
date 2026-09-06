import { container } from "@sapphire/framework";
import { registerRpcHandler, rpcHandlers } from "#lib/rpc/dispatch.js";
import { RpcActions } from "@lumi/contracts";
import { dismissLogClaim, listLogClaims } from "#lib/logging/claims.js";
import {
  LogClaimDismissSchema,
  parsePayload,
  requireGuildId,
  requireGuildManager,
  verifyGuildAccess,
} from "../lib/helpers.js";

export function registerLoggingRpcHandlers(): void {
  registerRpcHandler(RpcActions.guildLogClaimsList, async (req) => {
    const guildId = requireGuildId(req.guildId);
    await requireGuildManager(guildId, req.actorId);
    const claims = await listLogClaims(guildId);
    return { claims };
  });

  registerRpcHandler(RpcActions.guildLogClaimsDismiss, async (req) => {
    const { guildId, actorId } = await verifyGuildAccess(req);
    const { channelId, outcome } = parsePayload(
      LogClaimDismissSchema,
      req.data,
    );

    const dismissed = await dismissLogClaim(guildId, channelId);
    await container.db.audit.queueAuditLog({
      guildId,
      userId: actorId,
      action:
        outcome === "confirmed"
          ? "logging.claim.confirmed"
          : "logging.claim.dismissed",
      platform: "web",
      details: { channelId },
    });
    return { success: true, dismissed };
  });
}

export function unregisterLoggingRpcHandlers(): void {
  rpcHandlers.delete(RpcActions.guildLogClaimsList);
  rpcHandlers.delete(RpcActions.guildLogClaimsDismiss);
}
