import { SlashCommandBuilder } from "discord.js";
import type { CommandDef } from "#src/lib/commands/CommandDef.js";
import type { CommandContext } from "#src/lib/commands/Context.js";
import { BankService } from "#src/modules/economy/services/BankService.js";
import { formatAmount, getEconomyConfig } from "#src/modules/economy/Config.js";
import { reportEconomyError } from "#src/modules/economy/services/Respond.js";

export const paydayDef: CommandDef = {
  name: "payday",
  module: "economy",
  description: "Claim free currency. Cooldown applies between claims.",
  guildOnly: true,
  prefixEnabled: true,
  cooldownMs: 5000,
  build: () => {
    return new SlashCommandBuilder()
      .setName("payday")
      .setDescription("Claim free currency. Cooldown applies between claims.");
  },
  run: async (ctx: CommandContext) => {
    const guildId = ctx.guildId!;
    const config = await getEconomyConfig(ctx.services, guildId);
    try {
      const { balance, amount, capped } = await new BankService().payday(
        guildId,
        ctx.user.id,
        config,
      );
      const cappedNote = capped
        ? "\n-# Capped at the server maximum balance."
        : "";
      await ctx.replySuccess(
        "Payday claimed",
        `Here, take **${formatAmount(config, amount)}**. Enjoy!\nYou now have **${formatAmount(config, balance.total)}**.${cappedNote}`,
        { ephemeral: false },
      );
    } catch (err) {
      await reportEconomyError(ctx, err);
    }
  }
};
