import { ApplyOptions } from "@sapphire/decorators";
import { type ApplicationCommandRegistry } from "@sapphire/framework";
import { applyLocalizedBuilder } from "@sapphire/plugin-i18next";
import { BaseCommand, type CommandContext } from "#lib/commands.js";
import { WarnAction } from "../actions/index.js";

@ApplyOptions<BaseCommand.Options>({
  name: "warn",
  description: "Warn a member",
  preconditions: ["GuildOnly"],
  requiredPermit: "mod.*",
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

    const { caseRecord, warnCount } = await WarnAction.apply({
      guild: ctx.guild!,
      targetMember: member,
      moderator: ctx.user,
      reason,
    });

    return ctx.replySuccess(
      t("commands:warnSuccessTitle"),
      t("commands:warnSuccess", {
        user: member.user.username,
        reason,
        caseNumber: caseRecord.caseNumber,
        count: warnCount,
      }),
    );
  }
}
