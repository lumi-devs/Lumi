import { container } from "#lib/services.js";
import { loggingRpc } from "@lumi/contracts/rpc";
import { Routes } from "discord-api-types/v10";
import {
  dismissLogClaim,
  issueLogClaimCode,
  listLogClaims,
  LogClaimCodeTtlMs,
} from "@lumi/application/services/logging/claims.js";
import { implementRpc } from "#lib/rpc/implement.js";
import {
  fetchChannelRest,
  GuildTextBasedChannelTypes,
} from "#lib/rpc/discord-rest-lookup.js";

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
      const channel = await fetchChannelRest(replyChannelId);
      if (channel && GuildTextBasedChannelTypes.has(channel.type)) {
        await container.client.rest
          .delete(Routes.channelMessage(replyChannelId, claim.replyMessageId))
          .catch(() => null);
      }
    }

    return { success: true, dismissed: claim !== null };
  },
});
