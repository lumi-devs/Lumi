import type { Container } from "#lib/services.js";
import { Colors } from "discord.js";
import { fetchTyped } from "#lib/commands.js";
import { defineListener } from "#lib/listeners/listener-def.js";
import { memberRoleIds } from "#lib/permissions/subject.js";
import { LumiEvents, type GuildMessage } from "#lib/types/common.js";
import { makeCard } from "#lib/ui/cards.js";
import { logError } from "#lib/utilities/errors.js";
import {
  consumeLogClaimCode,
  normalizeLogClaimCode,
  peekLogClaimCode,
  registerLogClaim,
} from "@lumi/application/services/logging/claims.js";

export default defineListener({
  name: "loggingClaimMessage",
  event: LumiEvents.GuildUserMessage,
  module: "logging",
  async execute(services: Container, message: GuildMessage): Promise<void> {
    const code = normalizeLogClaimCode(message.content);
    if (!code) return;

    const guildId = message.guildId;
    if (!(await peekLogClaimCode(guildId, code))) return;

    const hasPermit = await services.permitResolver.hasPermit({
      guildId,
      userId: message.author.id,
      roleIds: memberRoleIds(message.member),
      channelId: message.channelId,
      permitNode: "logging.claim",
      guildOwnerId: message.guild.ownerId,
    });
    if (!hasPermit) return;
    if (!(await consumeLogClaimCode(guildId, code))) return;

    const t = await fetchTyped(message, services);
    const channel = message.channel;
    const channelId = channel?.isThread()
      ? (channel.parentId ?? message.channelId)
      : message.channelId;

    const reply = await message
      .reply({
        ...makeCard(
          Colors.Green,
          t("logging:claimAddedTitle"),
          t("logging:claimAddedMessage"),
        ),
      })
      .catch((err: unknown) => {
        logError("Logging: Claim confirmation reply failed", err);
        return null;
      });

    const claim = {
      channelId,
      authorId: message.author.id,
      messageId: message.id,
      claimedAt: new Date().toISOString(),
      replyChannelId: message.channelId,
      ...(reply ? { replyMessageId: reply.id } : {}),
    };
    await registerLogClaim(guildId, claim);
    await services.db.audit
      .queueAuditLog({
        guildId,
        userId: message.author.id,
        action: "logging.claim.registered",
        platform: "discord",
        details: { channelId: claim.channelId, messageId: claim.messageId },
      })
      .catch((err: unknown) =>
        logError("Logging: Claim audit write failed", err),
      );
  },
});
