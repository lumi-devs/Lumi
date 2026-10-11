import { container } from "#src/lib/Services.js";
import { type Guild, type User, Colors } from "discord.js";
import { formatAuditReason } from "#src/lib/utilities/AuditReason.js";
import { sendModActionDm } from "#src/modules/mod/services/Notify.js";
import { runModerationAction } from "#src/modules/mod/services/RunModerationAction.js";

export interface BanApplyOptions {
  guild: Guild;
  targetUser: User;
  moderator: User;
  reason: string;
  deleteMessageSeconds?: number;
}

export interface BanUndoOptions {
  guild: Guild;
  targetId: string;
  moderator: User;
  reason: string;
}

export class BanAction {
  public static async apply(options: BanApplyOptions) {
    const {
      guild,
      targetUser,
      moderator,
      reason,
      deleteMessageSeconds = 0,
    } = options;

    return runModerationAction({
      perform: async () => {
        await sendModActionDm(
          targetUser,
          "🔨",
          "Banned",
          guild,
          `You have been banned from **${guild.name}**.\n\n**Reason:** ${reason}`,
        );

        await guild.members.ban(targetUser.id, {
          reason: formatAuditReason(moderator, reason),
          deleteMessageSeconds,
        });

        return container.db.moderation.createModerationCase({
          guildId: guild.id,
          userId: targetUser.id,
          moderatorId: moderator.id,
          action: "ban",
          reason,
        });
      },
      log: (c) => ({
        guildId: guild.id,
        label: "🔨 Banned",
        color: Colors.DarkRed,
        targetId: targetUser.id,
        moderator,
        reason,
        caseNumber: c.caseNumber,
      }),
      appealDm: () => ({ targetUser, guild }),
    });
  }

  public static async undo(options: BanUndoOptions) {
    const { guild, targetId, moderator, reason } = options;

    await guild.bans.remove(targetId, formatAuditReason(moderator, reason));

    return container.db.moderation.createModerationCase({
      guildId: guild.id,
      userId: targetId,
      moderatorId: moderator.id,
      action: "unban",
      reason,
    });
  }

  public static async undoRaw(
    guildId: string,
    targetId: string,
    reason: string,
  ): Promise<void> {
    await container.discordRest.removeBan(guildId, targetId, reason);
  }
}
