import { ApplyOptions } from "@sapphire/decorators";
import { type ApplicationCommandRegistry } from "@sapphire/framework";
import { userMention } from "@discordjs/formatters";
import { BaseCommand, type CommandContext } from "#lib/commands.js";
import { logError } from "#lib/utilities/errors.js";
import { BanAction } from "../actions/index.js";

@ApplyOptions<BaseCommand.Options>({
  name: "unban",
  description: "Unban a user from the server",
  preconditions: ["GuildOnly"],
  requiredPermit: "mod.*",
  prefixEnabled: true,
  cooldownLimit: 3,
  cooldownDelay: 5000,
})
export class UnbanCommand extends BaseCommand {
  public override registerApplicationCommands(registry: ApplicationCommandRegistry) {
    registry.registerChatInputCommand((b) =>
      b
        .setName(this.name)
        .setDescription(this.description)
        .addStringOption((o) =>
          o.setName("user_id").setDescription("User ID or mention to unban").setRequired(true),
        )
        .addStringOption((o) =>
          o.setName("reason").setDescription("Reason for unbanning").setRequired(false),
        ),
    );
  }

  public override async run(ctx: CommandContext) {
    await ctx.defer();
    const t = await ctx.fetchT();
    const rawId = await ctx.getString("user_id", { required: true });
    const userId = rawId!.replace(/\D/g, "");
    const reason =
      (await ctx.getString("reason", { rest: true })) ??
      t("commands:modNoReason");

    if (!/^\d{17,20}$/.test(userId)) {
      return ctx.replyError(
        t("commands:banInvalidIdTitle"),
        t("commands:banInvalidId"),
      );
    }

    const guild = ctx.guild!;
    try {
      await BanAction.undo({
        guild,
        targetId: userId,
        moderator: ctx.user,
        reason,
      });
    } catch (err: unknown) {
      logError(`unban: guild=${guild.id} target=${userId}`, err);
      return ctx.replyError(
        t("commands:modActionFailedTitle"),
        t("commands:banRemoveFailed"),
      );
    }

    return ctx.replySuccess(
      t("commands:banRemoveSuccessTitle"),
      t("commands:banRemoveSuccess", { user: userMention(userId) }),
    );
  }
}
