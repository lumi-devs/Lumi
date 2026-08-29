import { container } from "@sapphire/framework";
import { type Guild, type GuildMember, type User, Colors } from "discord.js";
import { Routes } from "discord-api-types/v10";
import { formatAuditReason } from "#lib/utilities/misc.js";
import { liftAllActiveCases } from "../lib/helpers.js";
import { sendModActionDm } from "../lib/notify.js";
import { formatDuration } from "#lib/utilities/time.js";
import { errorCode } from "#lib/utilities/errors.js";
import { runModerationAction } from "../lib/runModerationAction.js";

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
      appealDm: () => ({ targetUser: targetMember.user, guild }),
    });
  }

  public static async undo(options: MuteUndoOptions) {
    const { guild, targetMember, moderator, reason } = options;

    await targetMember.timeout(null, formatAuditReason(moderator, reason));

    const c = await liftAllActiveCases(
      container,
      guild,
      targetMember.id,
      "mute",
      "unmute",
      moderator.id,
      reason,
    );

    return c;
  }

  public static async undoRaw(
    guildId: string,
    targetId: string,
    reason: string,
  ): Promise<void> {
    await container.client.rest
      .patch(Routes.guildMember(guildId, targetId), {
        body: { communication_disabled_until: null },
        reason,
      })
      .catch((err: unknown) => {
        const code = errorCode(err);
        if (code === 10007 || code === 50013) return;
        throw err;
      });
  }
}
