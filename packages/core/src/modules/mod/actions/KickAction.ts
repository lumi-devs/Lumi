import { container } from "@sapphire/framework";
import { type Guild, type GuildMember, type User, Colors } from "discord.js";
import { formatAuditReason } from "#lib/utilities/misc.js";
import { sendModActionDm } from "../lib/notify.js";
import { runModerationAction } from "../lib/runModerationAction.js";

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
