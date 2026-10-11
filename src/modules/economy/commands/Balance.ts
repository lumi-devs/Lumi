import { SlashCommandBuilder } from "discord.js";
import type { CommandDef } from "#src/lib/commands/CommandDef.js";
import type { CommandContext } from "#src/lib/commands/Context.js";
import { BankService } from "#src/modules/economy/services/BankService.js";
import { formatAmount, getEconomyConfig } from "#src/modules/economy/Config.js";
import { reportEconomyError } from "#src/modules/economy/services/Respond.js";

export const balanceDef: CommandDef = {
  name: "balance",
  module: "economy",
  description: "Show wallet and bank balances.",
  guildOnly: true,
  prefixEnabled: true,
  cooldownMs: 5000,
  build: () => {
    return new SlashCommandBuilder()
      .setName("balance")
      .setDescription("Show wallet and bank balances.")
      .addUserOption((opt) =>
        opt
          .setName("user")
          .setDescription("Whose balance to show. Defaults to you.")
          .setRequired(false),
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
