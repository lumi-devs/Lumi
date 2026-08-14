import { container } from "@sapphire/framework";
import { type Guild, type GuildMember, type User, Colors } from "discord.js";
import { formatAuditReason } from "#lib/utilities/misc.js";
import { logToChannel } from "../lib/helpers.js";
import { sendModActionDm } from "../lib/notify.js";

export interface KickApplyOptions {
  guild: Guild;
  targetMember: GuildMember;
  moderator: User;
  reason: string;
}

export class KickAction {
  public static async apply(options: KickApplyOptions) {
    const { guild, targetMember, moderator, reason } = options;

    await sendModActionDm(
      targetMember,
      "👢",
      "Kicked",
      guild,
      `You have been kicked from **${guild.name}**.\n\n**Reason:** ${reason}`,
    );

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
