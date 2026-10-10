import { SlashCommandBuilder } from "discord.js";
import type { CommandDef } from "@lumi/lib/commands/command-def.js";
import type { CommandContext } from "@lumi/lib/commands/context.js";
import { BankService } from "@lumi/application/services/economy/BankService.js";
import { formatAmount, getEconomyConfig } from "../config.js";
import { reportEconomyError } from "@lumi/application/services/economy/respond.js";

export const paydayDef: CommandDef = {
  name: "payday",
  module: "economy",
  description: "Claim free currency. Cooldown applies between claims.",
  guildOnly: true,
  prefixEnabled: true,
  cooldownMs: 5000,
  build: () => {
    const builder = new SlashCommandBuilder().setName("payday");
    return (
    builder.setName("payday").setDescription("Claim free currency. Cooldown applies between claims.")
    );
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
