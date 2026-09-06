import { ApplyOptions } from "@sapphire/decorators";
import { container } from "@sapphire/framework";
import { BaseCommand, type CommandContext } from "#lib/commands.js";
import { formatDuration } from "#utilities/time.js";
import { BankService } from "../services/BankService.js";
import {
  formatAmount,
  getEconomyConfig,
  type EconomyConfig,
} from "../index.js";
import { EconomyKeys } from "../keys.js";
import { SlotPayoutLabels, renderSlotGrid } from "../lib/slots.js";
import { reportEconomyError } from "../lib/respond.js";

async function claimSlotCooldown(config: EconomyConfig, guildId: string, userId: string): Promise<boolean> {
  if (config.slotCooldownMs <= 0) return true;
  const set = await container.redis.set(
    EconomyKeys.slotCooldown(guildId, userId),
    "1",
    "PX",
    config.slotCooldownMs,
    "NX",
  );
  return set !== null;
}

@ApplyOptions<BaseCommand.Options>({
  name: "slots",
  description: "Bet wallet currency on the slot machine.",
  preconditions: ["GuildOnly", "ModuleEnabled"],
  module: "economy",
  prefixEnabled: true,
  cooldownLimit: 3,
  cooldownDelay: 5000,
})
export default class SlotsCommand extends BaseCommand {
  public override registerApplicationCommands(registry: BaseCommand.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName(this.name)
        .setDescription(this.description)
        .addIntegerOption((opt) =>
          opt
            .setName("bid")
            .setDescription("How much to bet.")
            .setMinValue(1)
            .setRequired(true),
        ),
    );
  }

  public override async run(ctx: CommandContext) {
    const guildId = ctx.guildId!;
    const config = await getEconomyConfig(guildId);
    const bid = await ctx.getInteger("bid", { required: true });
    if (!(await claimSlotCooldown(config, guildId, ctx.user.id))) {
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
}
