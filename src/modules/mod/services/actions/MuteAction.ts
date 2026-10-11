import { container } from "#src/lib/Services.js";
import { type Guild, type GuildMember, type User, Colors } from "discord.js";
import { formatAuditReason } from "#src/lib/utilities/AuditReason.js";
import { liftAllActiveCases } from "#src/modules/mod/services/Helpers.js";
import { sendModActionDm } from "#src/modules/mod/services/Notify.js";
import { formatDuration } from "#src/lib/utilities/Time.js";
import { runModerationAction } from "#src/modules/mod/services/RunModerationAction.js";

export interface MuteApplyOptions {
  guild: Guild;
  targetMember: GuildMember;
  moderator: User;
  reason: string;
  durationMs: number;
}

export interface MuteUndoOptions {
  guild: Guild;
  targetMember: GuildMember;
  moderator: User;
  reason: string;
}

export class MuteAction {
  public static async apply(options: MuteApplyOptions) {
    const { guild, targetMember, moderator, reason, durationMs } = options;
    const expiresAt = new Date(Date.now() + durationMs);

    return runModerationAction({
      perform: async () => {
        await sendModActionDm(
          targetMember,
          "🔇",
          "Muted",
          guild,
          `You have been timed out in **${guild.name}** for **${formatDuration(durationMs)}**.\n\n**Reason:** ${reason}`,
        );

        await targetMember.timeout(
          durationMs,
          formatAuditReason(moderator, reason),
        );

        return container.db.moderation.createModerationCase({
          guildId: guild.id,
          userId: targetMember.id,
          moderatorId: moderator.id,
          action: "mute",
          reason,
          durationSeconds: Math.floor(durationMs / 1000),
          expiresAt,
        });
      },
      scheduleLift: true,
      log: (c) => ({
        guildId: guild.id,
        label: "🔇 Timed Out",
        color: Colors.Orange,
        targetId: targetMember.id,
        moderator,
        reason,
        caseNumber: c.caseNumber,
      }),
      appealDm: () =>
        targetMember.user
          ? { targetUser: targetMember.user, guild }
          : null,
    });
  }

  public static async undo(options: MuteUndoOptions) {
    const { guild, targetMember, moderator, reason } = options;

    await targetMember.timeout(null, formatAuditReason(moderator, reason));

    return liftAllActiveCases(
      container,
      guild,
      targetMember.id,
      "mute",
      "unmute",
      moderator.id,
      reason,
    );
  }

  public static async undoRaw(
    guildId: string,
    targetId: string,
    reason: string,
  ): Promise<void> {
    await container.discordRest.clearTimeout(guildId, targetId, reason);
  }
}
