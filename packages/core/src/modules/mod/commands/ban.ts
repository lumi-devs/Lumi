import { ApplyOptions } from "@sapphire/decorators";
import { type ApplicationCommandRegistry } from "@sapphire/framework";
import { applyLocalizedBuilder } from "@sapphire/plugin-i18next";
import { userMention } from "@discordjs/formatters";
import { Colors } from "discord.js";
import { BaseSubcommand, type CommandContext } from "#lib/commands.js";
import { PermissionLevel } from "#lib/permissions/index.js";
import { formatAuditReason } from "#lib/utilities/audit.js";
import { logError } from "#lib/utilities/errors.js";
import { logToChannel } from "../lib/helpers.js";

import { makeErrorCard } from "#lib/utilities/cards.js";

@ApplyOptions<BaseSubcommand.Options>({
  name: "ban",
  description: "Ban or unban a user",
  preconditions: ["GuildOnly"],
  permissionLevel: PermissionLevel.MOD,
  prefixEnabled: true,
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

    const dm = makeErrorCard(
      `🔨 Banned — ${guild.name}`,
      `You have been banned from **${guild.name}**.\n\n**Reason:** ${reason}`,
    );
    await user.send(dm).catch(() => null);

    try {
      await guild.members.ban(user.id, {
        reason: formatAuditReason(ctx.user, reason),
        deleteMessageSeconds: deleteDays * 86400,
      });
    } catch (err: unknown) {
      logError(`ban: guild=${guild.id} target=${user.id}`, err);
      return ctx.replyError(
        t("commands:modActionFailedTitle"),
        t("commands:modActionFailed"),
      );
    }

    const c = await this.container.db.moderation.createModerationCase({
      guildId: guild.id,
      userId: user.id,
      moderatorId: ctx.user.id,
      action: "ban",
      reason,
    });
    await logToChannel(
      guild.id,
      "🔨 Banned",
      Colors.DarkRed,
      user.id,
      ctx.user,
      reason,
      c.caseNumber,
    );
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
      await guild.bans.remove(userId, formatAuditReason(ctx.user, reason));
    } catch (err: unknown) {
      logError(`unban: guild=${guild.id} target=${userId}`, err);
      return ctx.replyError(
        t("commands:modActionFailedTitle"),
        t("commands:banRemoveFailed"),
      );
    }

    await this.container.db.moderation.createModerationCase({
      guildId: guild.id,
      userId,
      moderatorId: ctx.user.id,
      action: "unban",
      reason,
    });
    return ctx.replySuccess(
      t("commands:banRemoveSuccessTitle"),
      t("commands:banRemoveSuccess", { user: userMention(userId) }),
    );
  }
}
