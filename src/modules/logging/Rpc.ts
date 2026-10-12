import { container } from "#src/lib/Services.js";
import { loggingRpc } from "#src/contracts/rpc/Index.ts";
import { Routes } from "discord-api-types/v10";
import {
  dismissLogClaim,
  issueLogClaimCode,
  listLogClaims,
  LogClaimCodeTtlMs,
} from "#src/modules/logging/services/Claims.js";
import { implementRpc } from "#src/lib/rpc/Implement.js";
import {
  fetchChannelRest,
  GuildTextBasedChannelTypes,
} from "#src/lib/rpc/DiscordRestLookup.js";

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
