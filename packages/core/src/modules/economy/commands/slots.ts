import { SlashCommandBuilder } from "discord.js";
import type { CommandDef } from "@lumi/lib/commands/command-def.js";
import type { CommandContext } from "@lumi/lib/commands/context.js";
import type { Container } from "@lumi/lib/services.js";
import { claimCooldown } from "@lumi/lib/valkey/cooldown.js";
import { formatDuration } from "@lumi/lib/utilities/time.js";
import { BankService } from "@lumi/application/services/economy/BankService.js";
import {
  formatAmount,
  getEconomyConfig,
  type EconomyConfig,
} from "../config.js";
import { EconomyKeys } from "../constants.js";
import { SlotPayoutLabels, renderSlotGrid } from "@lumi/application/services/economy/slots.js";
import { reportEconomyError } from "@lumi/application/services/economy/respond.js";

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
    const builder = new SlashCommandBuilder().setName("slots");
    return (
    builder
            .setName("slots")
            .setDescription("Bet wallet currency on the slot machine.")
            .addIntegerOption((opt) =>
              opt
                .setName("bid")
                .setDescription("How much to bet.")
                .setMinValue(1)
                .setRequired(true),
            )
    ) as SlashCommandBuilder;
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
