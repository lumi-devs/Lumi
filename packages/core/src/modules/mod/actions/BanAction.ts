import { container } from "@sapphire/framework";
import { type Guild, type User, Colors } from "discord.js";
import { Routes } from "discord-api-types/v10";
import { formatAuditReason } from "#lib/utilities/misc.js";
import { logToChannel } from "../lib/helpers.js";
import { sendModActionDm } from "../lib/notify.js";
import { errorCode } from "#lib/utilities/errors.js";
import { sendAppealLinkDm } from "#lib/appeals/dm.js";

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

    const c = await container.db.moderation.createModerationCase({
      guildId: guild.id,
      userId: targetUser.id,
      moderatorId: moderator.id,
      action: "ban",
      reason,
    });

    await logToChannel(
      guild.id,
      "🔨 Banned",
      Colors.DarkRed,
      targetUser.id,
      moderator,
      reason,
      c.caseNumber,
    );

    await sendAppealLinkDm(targetUser, guild, c);

    return c;
  }

  public static async undo(options: BanUndoOptions) {
    const { guild, targetId, moderator, reason } = options;

    await guild.bans.remove(targetId, formatAuditReason(moderator, reason));

    const c = await container.db.moderation.createModerationCase({
      guildId: guild.id,
      userId: targetId,
      moderatorId: moderator.id,
      action: "unban",
      reason,
    });

    return c;
  }

  public static async undoRaw(
    guildId: string,
    targetId: string,
    reason: string,
  ): Promise<void> {
    await container.client.rest
      .delete(Routes.guildBan(guildId, targetId), { reason })
      .catch((err: unknown) => {
        const code = errorCode(err);
        if (code === 10026 || code === 50013) return;
        throw err;
      });
  }
}
