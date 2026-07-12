import { container } from "@sapphire/framework";
import { type Guild, type GuildMember, type User, Colors } from "discord.js";
import { formatAuditReason } from "#lib/utilities/audit.js";
import { makeErrorCard } from "#lib/utilities/cards.js";
import { logToChannel } from "../helpers.js";

export interface KickApplyOptions {
  guild: Guild;
  targetMember: GuildMember;
  moderator: User;
  reason: string;
}

export class KickAction {
  public static async apply(options: KickApplyOptions) {
    const { guild, targetMember, moderator, reason } = options;

    const dm = makeErrorCard(
      `👢 Kicked — ${guild.name}`,
      `You have been kicked from **${guild.name}**.\n\n**Reason:** ${reason}`,
    );
    await targetMember.send(dm).catch(() => null);

    await targetMember.kick(formatAuditReason(moderator, reason));

    const c = await container.db.moderation.createModerationCase({
      guildId: guild.id,
      userId: targetMember.id,
      moderatorId: moderator.id,
      action: "kick",
      reason,
    });

    await logToChannel(
      guild.id,
      "👢 Kicked",
      Colors.Red,
      targetMember.id,
      moderator,
      reason,
      c.caseNumber,
    );

    return c;
  }
}
