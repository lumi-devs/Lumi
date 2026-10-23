import {
  PermissionFlagsBits,
  SlashCommandBuilder,
  userMention,
} from "discord.js";
import type { CommandDef } from "@lumi/bot-kit";
import { makeErrorCard, makeSuccessCard } from "@lumi/ui";
import { logModAction, notifyPunishedUser, recordCase } from "../services/case.ts";
import { resolveUserTarget } from "../services/target.ts";

export const banCommand: CommandDef = {
  name: "ban",
  description: "Ban a user from the server.",
  module: "mod",
  guildOnly: true,
  prefix: true,
  permitNode: "mod.ban",
  requiredPermissions: PermissionFlagsBits.BanMembers,
  build: () =>
    new SlashCommandBuilder()
      .setName("ban")
      .setDescription("Ban a user from the server.")
      .addUserOption((option) =>
        option.setName("user").setDescription("User to ban").setRequired(true),
      )
      .addStringOption((option) =>
        option.setName("reason").setDescription("Reason for the ban").setMaxLength(1_000),
      )
      .addIntegerOption((option) =>
        option
          .setName("delete_days")
          .setDescription("Days of message history to delete (0-7)")
          .setMinValue(0)
          .setMaxValue(7),
      ),
  async run(ctx) {
    const guild = ctx.guild;
    if (!guild) return ctx.reply(makeErrorCard("Server Only", "This command can only be used in a server."));

    const resolved = await resolveUserTarget(ctx);
    if (resolved.error) return ctx.reply(resolved.error);

    const { user } = resolved.target;
    const reason = (await ctx.getString("reason", { rest: true })) ?? "No reason provided";
    const deleteDays = (await ctx.getInteger("delete_days")) ?? 0;

    await ctx.defer();

    const modCase = await recordCase(ctx.services, guild.id, {
      userId: user.id,
      moderatorId: ctx.user.id,
      action: "ban",
      reason,
    });

    try {
      await guild.members.ban(user.id, {
        reason: `${reason} | By ${ctx.user.tag} (Case #${modCase.caseNumber})`,
        deleteMessageSeconds: deleteDays * 86_400,
      });
    } catch (error) {
      await ctx.services.db.moderation.deleteCase(guild.id, modCase.caseNumber);
      const message = error instanceof Error ? error.message : "Discord rejected the ban.";
      return ctx.reply(makeErrorCard("Ban Failed", message));
    }

    await notifyPunishedUser(ctx.services, guild, user, "ban", reason);
    await logModAction(ctx.services, guild, modCase);

    return ctx.reply(
      makeSuccessCard(
        "Member Banned",
        `Banned ${userMention(user.id)} (Case **#${modCase.caseNumber}**).\n**Reason:** ${reason}`,
      ),
    );
  },
};
