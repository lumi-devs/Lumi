import { ApplyOptions } from "@sapphire/decorators";
import { container } from "@sapphire/framework";
import { Colors, PermissionFlagsBits } from "discord.js";
import { GuildMessageListener } from "#lib/module-system/GuildMessageListener.js";
import type { GuildMessage } from "#lib/types/common.js";
import { makeCard } from "#lib/utilities/cards.js";
import { logError } from "#lib/utilities/errors.js";
import {
  consumeLogClaimCode,
  normalizeLogClaimCode,
  peekLogClaimCode,
  registerLogClaim,
} from "#lib/logging/claims.js";

@ApplyOptions<GuildMessageListener.Options>({
  name: "loggingClaimMessage",
  module: "logging",
})
export default class LoggingClaimMessageListener extends GuildMessageListener {
  protected async handle(message: GuildMessage): Promise<void> {
    const code = normalizeLogClaimCode(message.content);
    if (!code) return;

    const guildId = message.guildId;
    if (!(await peekLogClaimCode(guildId, code))) return;

    if (!message.member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return;
    }
    if (!(await consumeLogClaimCode(guildId, code))) return;

    const claim = {
      channelId: message.channelId,
      authorId: message.author.id,
      messageId: message.id,
      claimedAt: new Date().toISOString(),
    };
    await registerLogClaim(guildId, claim);
    await container.db.audit
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

    await message
      .reply({
        ...makeCard(
          Colors.Green,
          "Channel claimed",
          "This channel is pending as a log destination. A manager can confirm it on the dashboard.",
        ),
      })
      .catch((err: unknown) =>
        logError("Logging: Claim confirmation reply failed", err),
      );
  }
}
