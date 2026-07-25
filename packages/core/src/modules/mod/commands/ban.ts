import { ApplyOptions } from "@sapphire/decorators";
import { type ApplicationCommandRegistry } from "@sapphire/framework";
import { applyLocalizedBuilder } from "@sapphire/plugin-i18next";
import { userMention } from "@discordjs/formatters";
import { BaseSubcommand, type CommandContext } from "#lib/commands.js";
import { PermissionLevel } from "#lib/permissions/index.js";
import { logError } from "#lib/utilities/errors.js";
import { BanAction } from "../actions/index.js";

@ApplyOptions<BaseSubcommand.Options>({
  name: "ban",
  description: "Ban or unban a user",
  preconditions: ["GuildOnly"],
  permissionLevel: PermissionLevel.MOD,
  prefixEnabled: true,
  cooldownLimit: 3,
  cooldownDelay: 5000,
  subcommands: [
    { name: "add", run: "add", default: true },
    { name: "remove", run: "remove" },
  ],
})
export class BanCommand extends BaseSubcommand {
  public override registerApplicationCommands(
    registry: ApplicationCommandRegistry,
  ) {
    registry.registerChatInputCommand((b) =>
      applyLocalizedBuilder(b, "commands:ban")
        .addSubcommand((s) =>
          applyLocalizedBuilder(s, "commands:banAdd")
            .addUserOption((o) =>
              applyLocalizedBuilder(o, "commands:banUser").setRequired(true),
            )
            .addStringOption((o) =>
              applyLocalizedBuilder(o, "commands:modReason").setRequired(false),
            )
            .addIntegerOption((o) =>
              applyLocalizedBuilder(o, "commands:banDeleteDays")
                .setMinValue(0)
                .setMaxValue(7)
                .setRequired(false),
            ),
        )
        .addSubcommand((s) =>
          applyLocalizedBuilder(s, "commands:banRemove")
            .addStringOption((o) =>
              applyLocalizedBuilder(o, "commands:banUserId").setRequired(true),
            )
            .addStringOption((o) =>
              applyLocalizedBuilder(o, "commands:modReason").setRequired(false),
            ),
        ),
    );
  }

  public async add(ctx: CommandContext) {
    await ctx.defer();
    const t = await ctx.fetchT();
    const user = await ctx.getUser("user");
    if (!user) {
      return ctx.replyError(
        t("commands:modMemberNotFoundTitle"),
        t("commands:modMemberNotFound"),
      );
    }
    const deleteDays = ctx.isSlash
      ? ((await ctx.getInteger("delete_days")) ?? 0)
      : 0;
    const reason =
      (await ctx.getString("reason", { rest: true })) ??
      t("commands:modNoReason");

    const guild = ctx.guild!;

    let c;
    try {
      c = await BanAction.apply({
        guild,
        targetUser: user,
        moderator: ctx.user,
        reason,
        deleteMessageSeconds: deleteDays * 86400,
      });
    } catch (err: unknown) {
      logError(`ban: guild=${guild.id} target=${user.id}`, err);
      return ctx.replyError(
        t("commands:modActionFailedTitle"),
        t("commands:modActionFailed"),
      );
    }

    return ctx.replySuccess(
      t("commands:banSuccessTitle"),
      t("commands:banSuccess", {
        user: userMention(user.id),
        reason,
        caseNumber: c.caseNumber,
      }),
    );
  }

  public async remove(ctx: CommandContext) {
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
