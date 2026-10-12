import { container } from "#src/lib/Services.js";
import { type Guild, type GuildMember, type User, Colors } from "discord.js";
import { formatAuditReason } from "#src/lib/utilities/AuditReason.js";
import { sendModActionDm } from "#src/modules/mod/services/Notify.js";
import { runModerationAction } from "#src/modules/mod/services/RunModerationAction.js";

export interface KickApplyOptions {
  guild: Guild;
  targetMember: GuildMember;
  moderator: User;
  reason: string;
}

export class KickAction {
  public static async apply(options: KickApplyOptions) {
    const { guild, targetMember, moderator, reason } = options;

    return runModerationAction({
      perform: async () => {
        await sendModActionDm(
          targetMember,
          "👢",
          "Kicked",
          guild,
          `You have been kicked from **${guild.name}**.\n\n**Reason:** ${reason}`,
        );

        await targetMember.kick(formatAuditReason(moderator, reason));

        return container.db.moderation.createModerationCase({
          guildId: guild.id,
          userId: targetMember.id,
          moderatorId: moderator.id,
          action: "kick",
          reason,
        });
      },
      log: (c) => ({
        guildId: guild.id,
        label: "👢 Kicked",
        color: Colors.Red,
        targetId: targetMember.id,
        moderator,
        reason,
        caseNumber: c.caseNumber,
      }),
    });
  }
}
