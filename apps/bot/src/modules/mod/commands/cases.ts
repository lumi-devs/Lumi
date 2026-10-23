import {
  PermissionFlagsBits,
  SlashCommandBuilder,
  time,
  userMention,
} from "discord.js";
import type { CommandDef } from "@lumi/bot-kit";
import { makeErrorCard, makeInfoCard, makeListCard } from "@lumi/ui";

const PageSize = 10;

export const casesCommand: CommandDef = {
  name: "cases",
  description: "View moderation history for the server or a specific user.",
  module: "mod",
  guildOnly: true,
  prefix: true,
  permitNode: "mod.cases",
  requiredPermissions: PermissionFlagsBits.ModerateMembers,
  build: () =>
    new SlashCommandBuilder()
      .setName("cases")
      .setDescription("View moderation history for the server or a specific user.")
      .addUserOption((option) => option.setName("user").setDescription("Filter by user"))
      .addIntegerOption((option) =>
        option.setName("page").setDescription("Page number").setMinValue(1),
      ),
  async run(ctx) {
    const guild = ctx.guild;
    if (!guild) return ctx.reply(makeErrorCard("Server Only", "This command can only be used in a server."));

    const targetUser = await ctx.getUser("user");
    const page = Math.max(1, (await ctx.getInteger("page")) ?? 1);
    const totalCount = await ctx.services.db.moderation.countCases(guild.id, targetUser?.id);
    if (totalCount === 0) {
      return ctx.reply(
        makeInfoCard(
          "No Cases Found",
          targetUser
            ? `${userMention(targetUser.id)} has no moderation cases.`
            : "No moderation cases recorded in this server.",
        ),
      );
    }

    const totalPages = Math.max(1, Math.ceil(totalCount / PageSize));
    const safePage = Math.min(page, totalPages);
    const cases = await ctx.services.db.moderation.listCases(guild.id, {
      ...(targetUser ? { userId: targetUser.id } : {}),
      limit: PageSize,
      offset: (safePage - 1) * PageSize,
    });

    const lines = cases.map((entry) => {
      const moderator = userMention(entry.moderatorId);
      const target = userMention(entry.userId);
      const status = entry.active ? "" : " · *inactive*";
      return `**#${entry.caseNumber}** • \`${entry.action.toUpperCase()}\` • ${target} by ${moderator} — ${entry.reason ?? "No reason"} *(${time(entry.createdAt, "R")})*${status}`;
    });

    return ctx.reply(
      makeListCard(
        targetUser
          ? `Cases for ${targetUser.displayName} (${totalCount})`
          : `Server Cases (${totalCount})`,
        lines,
        { subtitle: `Page ${safePage} of ${totalPages}` },
      ),
    );
  },
};
