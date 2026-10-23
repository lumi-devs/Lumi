import {
  PermissionFlagsBits,
  SlashCommandBuilder,
  userMention,
} from "discord.js";
import type { CommandDef } from "@lumi/bot-kit";
import { makeErrorCard, makeSuccessCard } from "@lumi/ui";
import { logModAction, recordCase } from "../services/case.ts";

export const unbanCommand: CommandDef = {
  name: "unban",
  description: "Unban a user from the server.",
  module: "mod",
  guildOnly: true,
  prefix: true,
  permitNode: "mod.unban",
  requiredPermissions: PermissionFlagsBits.BanMembers,
  build: () =>
    new SlashCommandBuilder()
      .setName("unban")
      .setDescription("Unban a user from the server.")
      .addStringOption((option) =>
        option.setName("user_id").setDescription("User ID to unban").setRequired(true),
      )
      .addStringOption((option) =>
        option.setName("reason").setDescription("Reason for the unban").setMaxLength(1_000),
      ),
  async run(ctx) {
    const guild = ctx.guild;
    if (!guild) return ctx.reply(makeErrorCard("Server Only", "This command can only be used in a server."));

    const rawId = await ctx.getString("user_id");
    const userId = rawId?.replace(/\D/g, "");
    if (!userId) {
      return ctx.reply(makeErrorCard("Invalid User ID", "Provide a valid numerical Discord user ID."));
    }

    const reason = (await ctx.getString("reason", { rest: true })) ?? "No reason provided";
    await ctx.defer();

    try {
      await guild.members.unban(userId, `${reason} | By ${ctx.user.tag}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Discord rejected the unban.";
      return ctx.reply(makeErrorCard("Unban Failed", message));
    }

    const modCase = await recordCase(ctx.services, guild.id, {
      userId,
      moderatorId: ctx.user.id,
      action: "unban",
      reason,
    });

    await logModAction(ctx.services, guild, modCase);

    return ctx.reply(
      makeSuccessCard(
        "Member Unbanned",
        `Unbanned ${userMention(userId)} (Case **#${modCase.caseNumber}**).\n**Reason:** ${reason}`,
      ),
    );
  },
};
