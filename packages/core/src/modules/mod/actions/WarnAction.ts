import { container } from "@sapphire/framework";
import { type Guild, type GuildMember, type User, Colors } from "discord.js";
import { makeSuccessCard } from "#lib/utilities/cards.js";
import { logToChannel } from "../lib/helpers.js";
import { incrementWarnCount, checkThresholds } from "../lib/thresholds.js";

export interface WarnApplyOptions {
  guild: Guild;
  targetMember: GuildMember;
  moderator: User;
  reason: string;
}

export class WarnAction {
  public static async apply(options: WarnApplyOptions) {
    const { guild, targetMember, moderator, reason } = options;

    const c = await container.db.moderation.createModerationCase({
      guildId: guild.id,
      userId: targetMember.id,
      moderatorId: moderator.id,
      action: "warn",
      reason,
    });

    const dm = makeSuccessCard(
      `⚠️ Warning - ${guild.name}`,
      `**Reason:** ${reason}\n-# Case #${c.caseNumber}`,
    );
    await targetMember.send(dm).catch(() => null);

    await logToChannel(
      guild.id,
      "⚠️ Warned",
      Colors.Yellow,
      targetMember.id,
      moderator,
      reason,
      c.caseNumber,
    ).catch((err: unknown) =>
      container.logger.warn("[Warn] Log channel send failed:", err),
    );

    const warnCount = await incrementWarnCount(
      container,
      guild.id,
      targetMember.id,
    );

    await checkThresholds(container, guild.id, targetMember.id, warnCount).catch(
      (err: unknown) =>
        container.logger.error("[Warn] Threshold check failed:", err),
    );

    return { caseRecord: c, warnCount };
  }
}
