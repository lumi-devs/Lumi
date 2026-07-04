import { ApplyOptions } from "@sapphire/decorators";
import { type ApplicationCommandRegistry } from "@sapphire/framework";
import { applyLocalizedBuilder } from "@sapphire/plugin-i18next";
import { Colors } from "discord.js";
import { BaseCommand, type CommandContext } from "#lib/commands.js";
import { PermissionLevel } from "#lib/permissions.js";
import { makeSuccessCard } from "#utilities/cards.js";
import { logToChannel } from "../lib/helpers.js";
import { incrementWarnCount, checkThresholds } from "../lib/thresholds.js";

@ApplyOptions<BaseCommand.Options>({
  name: "warn",
  description: "Warn a member",
  preconditions: ["GuildOnly"],
  permissionLevel: PermissionLevel.MOD,
  prefixEnabled: true,
})
export class WarnCommand extends BaseCommand {
  public override registerApplicationCommands(
    registry: ApplicationCommandRegistry,
  ) {
    registry.registerChatInputCommand((b) =>
      applyLocalizedBuilder(b, "commands:warn")
        .addUserOption((o) =>
          applyLocalizedBuilder(o, "commands:warnMember").setRequired(true),
        )
        .addStringOption((o) =>
          applyLocalizedBuilder(o, "commands:modReason").setRequired(false),
        ),
    );
  }

  public override async run(ctx: CommandContext) {
    await ctx.defer();
    const t = await ctx.fetchT();
    const member = await ctx.getMember("member");
    const reason =
      (await ctx.getString("reason", { rest: true })) ??
      t("commands:modNoReason");
    if (!member) {
      return ctx.replyError(
        t("commands:modMemberNotFoundTitle"),
        t("commands:modMemberNotFound"),
      );
    }

    const c = await this.container.db.moderation.createModerationCase({
      guildId: ctx.guildId!,
      userId: member.id,
      moderatorId: ctx.user.id,
      action: "warn",
      reason,
    });

    await member
      .send(
        makeSuccessCard(
          `⚠️ Warning — ${member.guild.name}`,
          `**Reason:** ${reason}\n-# Case #${c.caseNumber}`,
        ),
      )
      .catch(() => null);

    await logToChannel(
      ctx.guildId!,
      "⚠️ Warned",
      Colors.Yellow,
      member.id,
      ctx.user,
      reason,
      c.caseNumber,
    ).catch((err: unknown) =>
      this.container.logger.warn("[Warn] Log channel send failed:", err),
    );

    const warnCount = await incrementWarnCount(
      this.container,
      ctx.guildId!,
      member.id,
    );
    checkThresholds(this.container, ctx.guildId!, member.id, warnCount).catch(
      (err: unknown) =>
        this.container.logger.error("[Warn] Threshold check failed:", err),
    );

    return ctx.replySuccess(
      t("commands:warnSuccessTitle"),
      t("commands:warnSuccess", {
        user: member.user.username,
        reason,
        caseNumber: c.caseNumber,
        count: warnCount,
      }),
    );
  }
}
