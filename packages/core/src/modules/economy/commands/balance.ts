import { SlashCommandBuilder } from "discord.js";
import type { CommandDef } from "@lumi/lib/commands/command-def.js";
import type { CommandContext } from "@lumi/lib/commands/context.js";
import { BankService } from "@lumi/application/services/economy/BankService.js";
import { formatAmount, getEconomyConfig } from "../config.js";
import { reportEconomyError } from "@lumi/application/services/economy/respond.js";

export const balanceDef: CommandDef = {
  name: "balance",
  module: "economy",
  description: "Show wallet and bank balances.",
  guildOnly: true,
  prefixEnabled: true,
  cooldownMs: 5000,
  build: () => {
    const builder = new SlashCommandBuilder().setName("balance");
    return (
    builder
            .setName("balance")
            .setDescription("Show wallet and bank balances.")
            .addUserOption((opt) =>
              opt
                .setName("user")
                .setDescription("Whose balance to show. Defaults to you.")
                .setRequired(false),
            )
    ) as SlashCommandBuilder;
  },
  run: async (ctx: CommandContext) => {
    const guildId = ctx.guildId!;
    const config = await getEconomyConfig(ctx.services, guildId);
    const target = (await ctx.getUser("user")) ?? ctx.user;
    try {
      const balance = await new BankService().getBalance(
        guildId,
        target.id,
        config,
      );
      await ctx.replyInfo(
        `💰 ${target.username}`,
        [
          `Wallet: **${formatAmount(config, balance.wallet)}**`,
          `Bank: **${formatAmount(config, balance.bank)}**`,
          `Total: **${formatAmount(config, balance.total)}**`,
        ].join("\n"),
        { ephemeral: false },
      );
    } catch (err) {
      await reportEconomyError(ctx, err);
    }
  }
};
