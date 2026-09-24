import { container } from "@sapphire/framework";
import { loggingRpc } from "@lumi/contracts/rpc";
import {
  dismissLogClaim,
  issueLogClaimCode,
  listLogClaims,
  LogClaimCodeTtlMs,
} from "./services/claims.js";
import { implementRpc } from "#lib/rpc/implement.js";

export const loggingRpcHandlers = implementRpc(loggingRpc, {
  "guild.logClaims.list": async ({ guildId }) => ({
    claims: await listLogClaims(guildId),
  }),

  "guild.logClaims.issue": async ({ guildId, actorId }) => ({
    code: await issueLogClaimCode(guildId, actorId),
    expiresIn: LogClaimCodeTtlMs,
  }),

  "guild.logClaims.dismiss": async ({ guildId, actorId, input }) => {
    const { channelId, outcome } = input;
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
  },
});
