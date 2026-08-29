import { container } from "@sapphire/framework";
import { type Guild, type User, Colors } from "discord.js";
import { formatAuditReason } from "#lib/utilities/misc.js";
import { sendModActionDm } from "../lib/notify.js";
import { runModerationAction } from "../lib/runModerationAction.js";

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

    return runModerationAction({
      perform: async () => {
        await sendModActionDm(
          targetUser,
          "🧹",
          "Softbanned",
          guild,
          `You have been softbanned from **${guild.name}** to clear recent message history.\n\n**Reason:** ${reason}`,
        );

        const auditReason = formatAuditReason(moderator, `[Softban] ${reason}`);

        await guild.members.ban(targetUser.id, {
          reason: auditReason,
          deleteMessageSeconds,
        });

        await guild.bans.remove(targetUser.id, auditReason).catch(() => null);

        return container.db.moderation.createModerationCase({
          guildId: guild.id,
          userId: targetUser.id,
          moderatorId: moderator.id,
          action: "softban",
          reason,
        });
      },
      log: (c) => ({
        guildId: guild.id,
        label: "🧹 Softbanned",
        color: Colors.Orange,
        targetId: targetUser.id,
        moderator,
        reason,
        caseNumber: c.caseNumber,
      }),
    });
  }
}
