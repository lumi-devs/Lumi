import {
  PermissionFlagsBits,
  SlashCommandBuilder,
  userMention,
} from "discord.js";
import type { CommandDef } from "@lumi/bot-kit";
import { makeErrorCard, makeSuccessCard } from "@lumi/ui";
import { logModAction, notifyPunishedUser, recordCase } from "../services/case.ts";
import { resolveMemberTarget } from "../services/target.ts";
import { applyWarnThresholds } from "../services/thresholds.ts";

export const warnCommand: CommandDef = {
  name: "warn",
  description: "Issue a formal moderation warning to a member.",
  module: "mod",
  guildOnly: true,
  prefix: true,
  permitNode: "mod.warn",
  requiredPermissions: PermissionFlagsBits.ModerateMembers,
  build: () =>
    new SlashCommandBuilder()
      .setName("warn")
      .setDescription("Issue a formal moderation warning to a member.")
      .addUserOption((option) =>
        option.setName("user").setDescription("Member to warn").setRequired(true),
      )
      .addStringOption((option) =>
        option.setName("reason").setDescription("Reason for the warning").setRequired(true).setMaxLength(1_000),
      ),
  async run(ctx) {
    const guild = ctx.guild;
    if (!guild) return ctx.reply(makeErrorCard("Server Only", "This command can only be used in a server."));

    const resolved = await resolveMemberTarget(ctx);
    if (resolved.error) return ctx.reply(resolved.error);

    const { user, member } = resolved.target;
    const reason = await ctx.getString("reason", { rest: true });
    if (!reason) {
      return ctx.reply(makeErrorCard("Missing Reason", "You must provide a reason for the warning."));
    }

    await ctx.defer();

    const modCase = await recordCase(ctx.services, guild.id, {
      userId: user.id,
      moderatorId: ctx.user.id,
      action: "warn",
      reason,
    });

    await notifyPunishedUser(ctx.services, guild, user, "warning", reason);
    await logModAction(ctx.services, guild, modCase);

    const warnCount = await ctx.services.db.moderation.countCases(guild.id, user.id, "warn");
    await applyWarnThresholds(ctx.services, guild, member, warnCount).catch((error: unknown) => {
      ctx.services.logger.error(
        { error, guildId: guild.id, userId: user.id, warnCount },
        "warn threshold action failed",
      );
    });

    return ctx.reply(
      makeSuccessCard(
        "Warning Issued",
        `Warned ${userMention(user.id)} (Case **#${modCase.caseNumber}**).\n**Reason:** ${reason}`,
      ),
    );
  },
};
