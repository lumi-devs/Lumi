import { container } from "@sapphire/framework";
import { type Guild, type GuildMember, type User, Colors } from "discord.js";
import { makeSuccessCard } from "#lib/utilities/cards.js";
import { incrementWarnCount, checkThresholds } from "../lib/thresholds.js";
import { runModerationAction } from "../lib/runModerationAction.js";

export interface WarnApplyOptions {
  guild: Guild;
  targetMember: GuildMember;
  moderator: User;
  reason: string;
}

export class WarnAction {
  public static async apply(options: WarnApplyOptions) {
    const { guild, targetMember, moderator, reason } = options;

    const c = await runModerationAction({
      perform: async () => {
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

        return c;
      },
      log: (c) => ({
        guildId: guild.id,
        label: "⚠️ Warned",
        color: Colors.Yellow,
        targetId: targetMember.id,
        moderator,
        reason,
        caseNumber: c.caseNumber,
      }),
    });

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
