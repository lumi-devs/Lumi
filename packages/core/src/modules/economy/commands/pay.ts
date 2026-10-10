import { SlashCommandBuilder } from "discord.js";
import type { CommandDef } from "@lumi/lib/commands/command-def.js";
import { userMention } from "@discordjs/formatters";
import type { CommandContext } from "@lumi/lib/commands/context.js";
import { BankService } from "@lumi/application/services/economy/BankService.js";
import { formatAmount, getEconomyConfig } from "../config.js";
import { reportEconomyError } from "@lumi/application/services/economy/respond.js";

export const payDef: CommandDef = {
  name: "pay",
  module: "economy",
  description: "Transfer currency to another member. A tax may apply.",
  guildOnly: true,
  prefixEnabled: true,
  cooldownMs: 5000,
  build: () => {
    const builder = new SlashCommandBuilder().setName("pay");
    return (
    builder
            .setName("pay")
            .setDescription("Transfer currency to another member. A tax may apply.")
            .addUserOption((opt) =>
              opt
                .setName("user")
                .setDescription("Who receives the currency.")
                .setRequired(true),
            )
            .addIntegerOption((opt) =>
              opt
                .setName("amount")
                .setDescription("How much to send.")
                .setMinValue(1)
                .setRequired(true),
            )
    ) as SlashCommandBuilder;
  },
  run: async (ctx: CommandContext) => {
    const guildId = ctx.guildId!;
    const config = await getEconomyConfig(ctx.services, guildId);
    const target = await ctx.getUser("user", { required: true });
    const amount = await ctx.getInteger("amount", { required: true });
    try {
      const { sent, fee, received } = await new BankService().transfer(
        guildId,
        ctx.user.id,
        target!.id,
        amount!,
        config,
      );
      const taxNote =
        fee > 0
          ? `\nTax burned: **${formatAmount(config, fee)}** (${config.transferTaxPercent}%).`
          : "";
      await ctx.replySuccess(
        "Transfer complete",
        `${userMention(ctx.user.id)} sent **${formatAmount(config, sent)}** to ${userMention(target!.id)}.\nThey receive **${formatAmount(config, received)}**.${taxNote}`,
        { ephemeral: false },
      );
    } catch (err) {
      await reportEconomyError(ctx, err);
    }
  }
};
