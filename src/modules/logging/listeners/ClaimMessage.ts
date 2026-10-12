import type { Container } from "#src/lib/Services.js";
import { Colors } from "discord.js";
import { fetchTyped } from "#src/lib/i18n/Index.js";
import { defineListener } from "#src/lib/listeners/ListenerDef.js";
import { memberRoleIds } from "#src/lib/api/permissions/Subject.js";
import { LumiEvents, type GuildMessage } from "#src/lib/types/Common.js";
import { makeCard } from "#src/lib/ui/Cards.js";
import { logError } from "#src/lib/utilities/Errors.js";
import {
  consumeLogClaimCode,
  normalizeLogClaimCode,
  peekLogClaimCode,
  registerLogClaim,
} from "#src/modules/logging/services/Claims.js";

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
