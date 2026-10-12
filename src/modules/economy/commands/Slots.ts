import { SlashCommandBuilder } from "discord.js";
import type { CommandDef } from "#src/lib/commands/CommandDef.js";
import type { CommandContext } from "#src/lib/commands/Context.js";
import type { Container } from "#src/lib/Services.js";
import { claimCooldown } from "#src/lib/valkey/Cooldown.js";
import { formatDuration } from "#src/lib/utilities/Time.js";
import { BankService } from "#src/modules/economy/services/BankService.js";
import {
  formatAmount,
  getEconomyConfig,
  type EconomyConfig,
} from "#src/modules/economy/Config.js";
import { EconomyKeys } from "#src/modules/economy/Constants.js";
import { SlotPayoutLabels, renderSlotGrid } from "#src/modules/economy/services/Slots.js";
import { reportEconomyError } from "#src/modules/economy/services/Respond.js";

async function claimSlotCooldown(services: Container, config: EconomyConfig, guildId: string, userId: string): Promise<boolean> {
  if (config.slotCooldownMs <= 0) return true;
  return claimCooldown(services, EconomyKeys.slotCooldown(guildId, userId), config.slotCooldownMs);
}

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
    if (!(await claimSlotCooldown(ctx.services, config, guildId, ctx.user.id))) {
      await ctx.replyError(
        "On cooldown",
        `The slots are cooling down. Try again in ${formatDuration(config.slotCooldownMs)}.`,
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
