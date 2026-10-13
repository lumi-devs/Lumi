import { SlashCommandBuilder } from "discord.js";
import type { CommandDef } from "#src/lib/commands/CommandDef.js";
import type { CommandContext } from "#src/lib/commands/Context.js";
import { BankService, InvalidAmountError } from "#src/modules/economy/services/BankService.js";
import {
  formatAmount,
  getEconomyConfig,
} from "#src/modules/economy/Config.js";
import { SlotPayoutLabels, renderSlotGrid } from "#src/modules/economy/services/Slots.js";
import { reportEconomyError } from "#src/modules/economy/services/Respond.js";

export const slotsDef: CommandDef = {
  name: "slots",
  module: "economy",
  description: "Bet wallet currency on the slot machine.",
  guildOnly: true,
  prefixEnabled: true,
  cooldownMs: 5000,
  build: () => {
    return new SlashCommandBuilder()
      .setName("slots")
      .setDescription("Bet wallet currency on the slot machine.")
      .addIntegerOption((opt) =>
        opt
          .setName("bid")
          .setDescription("How much to bet.")
          .setMinValue(1)
          .setRequired(true),
      );
  },
  run: async (ctx: CommandContext) => {
    const guildId = ctx.guildId!;
    const config = await getEconomyConfig(ctx.services, guildId);
    const bid = await ctx.getInteger("bid", { required: true });
    if (!Number.isInteger(bid) || bid! < config.slotMinBid || bid! > config.slotMaxBid) {
      await reportEconomyError(
        ctx,
        new InvalidAmountError(
          `Bid must be between ${config.slotMinBid} and ${config.slotMaxBid}.`,
        ),
      );
      return;
    }
    try {
      const result = await new BankService().playSlots(
        guildId,
        ctx.user.id,
        bid!,
        config,
      );
      const grid = renderSlotGrid(result.spin);
      if (result.won) {
        const label = result.payoutKey
          ? SlotPayoutLabels[result.payoutKey as keyof typeof SlotPayoutLabels]
          : "Winner";
        await ctx.replySuccess(
          `🎰 ${label}! ×${result.multiplier}`,
          [
            `\`\`\`${grid}\`\`\``,
            `Bid: **${formatAmount(config, result.bid)}** · Won: **${formatAmount(config, result.pay)}**`,
            `Balance: **${formatAmount(config, result.balanceAfter)}**`,
          ].join("\n"),
          { ephemeral: false },
        );
      } else {
        await ctx.replyInfo(
          "🎰 Nothing!",
          [
            `\`\`\`${grid}\`\`\``,
            `Bid lost: **${formatAmount(config, result.bid)}**`,
            `Balance: **${formatAmount(config, result.balanceAfter)}**`,
          ].join("\n"),
          { ephemeral: false },
        );
      }
    } catch (err) {
      await reportEconomyError(ctx, err);
    }
  }
};
