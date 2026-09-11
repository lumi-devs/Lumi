import { container } from "@sapphire/framework";
import { registerRpcHandler, rpcHandlers } from "#lib/rpc/dispatch.js";
import { RpcActions } from "@lumi/contracts";
import { dismissLogClaim, issueLogClaimCode, listLogClaims, LogClaimCodeTtlMs } from "#lib/logging/claims.js";
import {
  LogClaimDismissSchema,
  parsePayload,
  requireGuildId,
  requireGuildManager,
  verifyGuildAccess,
} from "#lib/rpc/helpers.js";

export function registerLoggingRpcHandlers(): void {
  registerRpcHandler(RpcActions.guildLogClaimsList, async (req) => {
    const guildId = requireGuildId(req.guildId);
    await requireGuildManager(guildId, req.actorId);
    const claims = await listLogClaims(guildId);
    return { claims };
  });

  registerRpcHandler(RpcActions.guildLogClaimsIssue, async (req) => {
    const guildId = requireGuildId(req.guildId);
    const actorId = await requireGuildManager(guildId, req.actorId);
    const code = await issueLogClaimCode(guildId, actorId);
    return { code, expiresIn: LogClaimCodeTtlMs };
  });

  registerRpcHandler(RpcActions.guildLogClaimsDismiss, async (req) => {
    const { guildId, actorId } = await verifyGuildAccess(req);
    const { channelId, outcome } = parsePayload(
      LogClaimDismissSchema,
      req.data,
    );

    const claim = await dismissLogClaim(guildId, channelId);
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

    // Best-effort: the "claimed" reply has done its job once the dashboard
    // has resolved it, and left in place it just reads as stale noise.
    if (claim?.replyMessageId) {
      const replyChannelId = claim.replyChannelId ?? claim.channelId;
      const channel =
        container.client.channels.cache.get(replyChannelId) ??
        (await container.client.channels.fetch(replyChannelId).catch(() => null));
      if (channel?.isTextBased() && "messages" in channel) {
        await channel.messages.delete(claim.replyMessageId).catch(() => null);
      }
    }

    return { success: true, dismissed: claim !== null };
  });
}

export function unregisterLoggingRpcHandlers(): void {
  rpcHandlers.delete(RpcActions.guildLogClaimsList);
  rpcHandlers.delete(RpcActions.guildLogClaimsIssue);
  rpcHandlers.delete(RpcActions.guildLogClaimsDismiss);
}
