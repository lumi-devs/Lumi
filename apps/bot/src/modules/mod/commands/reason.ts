import {
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import type { CommandDef } from "@lumi/bot-kit";
import { makeErrorCard, makeSuccessCard } from "@lumi/ui";

export const reasonCommand: CommandDef = {
  name: "reason",
  description: "Update the reason for an existing moderation case.",
  module: "mod",
  guildOnly: true,
  prefix: true,
  permitNode: "mod.reason",
  requiredPermissions: PermissionFlagsBits.ModerateMembers,
  build: () =>
    new SlashCommandBuilder()
      .setName("reason")
      .setDescription("Update the reason for an existing moderation case.")
      .addIntegerOption((option) =>
        option.setName("case").setDescription("Case number").setRequired(true).setMinValue(1),
      )
      .addStringOption((option) =>
        option.setName("reason").setDescription("New reason").setRequired(true).setMaxLength(1_000),
      ),
  async run(ctx) {
    const guild = ctx.guild;
    if (!guild) return ctx.reply(makeErrorCard("Server Only", "This command can only be used in a server."));

    const caseNumber = await ctx.getInteger("case");
    const reason = await ctx.getString("reason", { rest: true });
    if (!caseNumber || !reason) {
      return ctx.reply(makeErrorCard("Invalid Usage", "Provide both the case number and the new reason."));
    }

    const updated = await ctx.services.db.moderation.updateCaseReason(guild.id, caseNumber, reason);
    if (!updated) {
      return ctx.reply(makeErrorCard("Not Found", `Case **#${caseNumber}** was not found.`));
    }

    return ctx.reply(
      makeSuccessCard(
        "Reason Updated",
        `Updated the reason for Case **#${caseNumber}** to:\n> ${reason}`,
      ),
    );
  },
};
