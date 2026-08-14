import { container } from "@sapphire/framework";
import { type Guild, type User, Colors } from "discord.js";
import { formatAuditReason } from "#lib/utilities/misc.js";
import { logToChannel } from "../lib/helpers.js";
import { sendModActionDm } from "../lib/notify.js";

export interface SoftbanApplyOptions {
  guild: Guild;
  targetUser: User;
  moderator: User;
  reason: string;
  deleteMessageDays?: number;
}

export class SoftbanAction {
  public static async apply(options: SoftbanApplyOptions) {
    const {
      guild,
      targetUser,
      moderator,
      reason,
      deleteMessageDays = 1,
    } = options;

    const days = Math.min(Math.max(deleteMessageDays, 1), 7);
    const deleteMessageSeconds = days * 86400;

    await sendModActionDm(
      targetUser,
      "🧹",
      "Softbanned",
      guild,
      `You have been softbanned from **${guild.name}** to clear recent message history.\n\n**Reason:** ${reason}`,
    );

    const auditReason = formatAuditReason(moderator, `[Softban] ${reason}`);

    // Ban and immediately unban
    await guild.members.ban(targetUser.id, {
      reason: auditReason,
      deleteMessageSeconds,
    });

    await guild.bans.remove(targetUser.id, auditReason).catch(() => null);

    const c = await container.db.moderation.createModerationCase({
      guildId: guild.id,
      userId: targetUser.id,
      moderatorId: moderator.id,
      action: "softban",
      reason,
    });

    await logToChannel(
      guild.id,
      "🧹 Softbanned",
      Colors.Orange,
      targetUser.id,
      moderator,
      reason,
      c.caseNumber,
    );

    return c;
  }
}
