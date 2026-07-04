import { ApplyOptions } from "@sapphire/decorators";
import { type ApplicationCommandRegistry } from "@sapphire/framework";
import { applyLocalizedBuilder } from "@sapphire/plugin-i18next";
import { Colors } from "discord.js";
import { BaseCommand, type CommandContext } from "#lib/commands.js";
import { PermissionLevel } from "#lib/permissions.js";
import { formatAuditReason } from "#utilities/audit.js";
import { logError } from "#utilities/errors.js";
import { logToChannel } from "../lib/helpers.js";

@ApplyOptions<BaseCommand.Options>({
  name: "kick",
  description: "Kick a member from the server",
  preconditions: ["GuildOnly"],
  permissionLevel: PermissionLevel.MOD,
  prefixEnabled: true,
})
export class KickCommand extends BaseCommand {
  public override registerApplicationCommands(
    registry: ApplicationCommandRegistry,
  ) {
    registry.registerChatInputCommand((b) =>
      applyLocalizedBuilder(b, "commands:kick")
        .addUserOption((o) =>
          applyLocalizedBuilder(o, "commands:kickMember").setRequired(true),
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

    try {
      await member.kick(formatAuditReason(ctx.user, reason));
    } catch (err: unknown) {
      logError(`kick: guild=${ctx.guildId} target=${member.id}`, err);
      return ctx.replyError(
        t("commands:modActionFailedTitle"),
        t("commands:modActionFailed"),
      );
    }

    const c = await this.container.db.moderation.createModerationCase({
      guildId: ctx.guildId!,
      userId: member.id,
      moderatorId: ctx.user.id,
      action: "kick",
      reason,
    });
    await logToChannel(
      ctx.guildId!,
      "👢 Kicked",
      Colors.Red,
      member.id,
      ctx.user,
      reason,
      c.caseNumber,
    );
    return ctx.replySuccess(
      t("commands:kickSuccessTitle"),
      t("commands:kickSuccess", {
        user: member.user.username,
        reason,
        caseNumber: c.caseNumber,
      }),
    );
  }
}
