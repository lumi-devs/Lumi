import { SlashCommandBuilder } from "discord.js";
import type { CommandDef } from "@lumi/lib/commands/command-def.js";
import { userMention } from "@discordjs/formatters";
import type { CommandContext } from "@lumi/lib/commands/context.js";
import { paginateList } from "@lumi/lib/utilities/pagination.js";
import { BankService } from "@lumi/application/services/economy/BankService.js";
import { formatAmount, getEconomyConfig } from "../config.js";
import { reportEconomyError } from "@lumi/application/services/economy/respond.js";

export const leaderboardDef: CommandDef = {
  name: "leaderboard",
  module: "economy",
  description: "Show the richest members on this server.",
  guildOnly: true,
  prefixEnabled: true,
  cooldownMs: 5000,
  build: () => {
    const builder = new SlashCommandBuilder().setName("leaderboard");
    return (
    builder
            .setName("leaderboard")
            .setDescription("Show the richest members on this server.")
            .addIntegerOption((opt) =>
              opt
                .setName("count")
                .setDescription("How many entries to show. Defaults to 10.")
                .setMinValue(1)
                .setMaxValue(50)
                .setRequired(false),
            )
    ) as SlashCommandBuilder;
  },
  run: async (ctx: CommandContext) => {
    const guildId = ctx.guildId!;
    const config = await getEconomyConfig(ctx.services, guildId);
    const count = (await ctx.getInteger("count")) ?? 10;
    try {
      const { entries } = await new BankService().leaderboard(
        guildId,
        Math.min(50, Math.max(1, count)),
      );
      if (entries.length === 0) {
        await ctx.replyEmpty(
          "Leaderboard",
          "Nobody has an economy account on this server yet.",
          "Claim a payday or ask staff to grant currency.",
          { ephemeral: false },
        );
        return;
      }
      const items = entries.map((entry) => {
        const marker = entry.userId === ctx.user.id ? " **← you**" : "";
        return `**#${entry.rank}** ${userMention(entry.userId)} — ${formatAmount(config, entry.total)}${marker}`;
      });
      await paginateList({
        interactionOrMessage: ctx.source,
        userId: ctx.user.id,
        title: `🏆 Richest in ${ctx.guild?.name ?? "this server"}`,
        items,
        perPage: 10,
        ephemeral: false,
      });
    } catch (err) {
      await reportEconomyError(ctx, err);
    }
  }
};
