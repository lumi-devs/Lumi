import {
  PermissionFlagsBits,
  SlashCommandBuilder,
  time,
  userMention,
} from "discord.js";
import type { CommandDef } from "@lumi/module-kit";
import {
  makeCard,
  makeErrorCard,
  resolveCardColor,
} from "@lumi/ui";

export const caseCommand: CommandDef = {
  name: "case",
  description: "View details of a specific moderation case.",
  module: "mod",
  guildOnly: true,
  prefix: true,
  permitNode: "mod.cases",
  requiredPermissions: PermissionFlagsBits.ModerateMembers,
  build: () =>
    new SlashCommandBuilder()
      .setName("case")
      .setDescription("View details of a specific moderation case.")
      .addIntegerOption((option) =>
        option.setName("number").setDescription("Case number").setRequired(true).setMinValue(1),
      ),
  async run(ctx) {
    const guild = ctx.guild;
    if (!guild) return ctx.reply(makeErrorCard("Server Only", "This command can only be used in a server."));

    const caseNumber = await ctx.getInteger("number");
    if (!caseNumber) {
      return ctx.reply(makeErrorCard("Invalid Number", "Specify a valid case number."));
    }

    const modCase = await ctx.services.db.moderation.getCase(guild.id, caseNumber);
    if (!modCase) {
      return ctx.reply(makeErrorCard("Not Found", `Case **#${caseNumber}** does not exist.`));
    }

    const lines = [
      `**Action:** \`${modCase.action.toUpperCase()}\``,
      `**Status:** ${modCase.active ? "🟢 Active" : "⚪ Inactive"}`,
      `**Target:** ${userMention(modCase.userId)} (\`${modCase.userId}\`)`,
      `**Moderator:** ${userMention(modCase.moderatorId)} (\`${modCase.moderatorId}\`)`,
      `**Reason:** ${modCase.reason ?? "No reason provided."}`,
      `**Created:** ${time(modCase.createdAt, "F")} (${time(modCase.createdAt, "R")})`,
    ];

    if (modCase.expiresAt) {
      lines.push(`**Expires:** ${time(modCase.expiresAt, "F")} (${time(modCase.expiresAt, "R")})`);
    }

    return ctx.reply(
      makeCard(resolveCardColor("info"), `Case #${modCase.caseNumber}`, lines.join("\n"), {
        breadcrumbs: ["Cases", `#${modCase.caseNumber}`],
      }),
    );
  },
};
