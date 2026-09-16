import { ApplyOptions } from "@sapphire/decorators";
import { BaseCommand } from "#lib/commands.js";
import type { CommandContext } from "#lib/command-context.js";
import { BankService } from "../services/BankService.js";
import { formatAmount, getEconomyConfig } from "../config.js";
import { reportEconomyError } from "../services/respond.js";

@ApplyOptions<BaseCommand.Options>({
  name: "payday",
  description: "Claim free currency. Cooldown applies between claims.",
  preconditions: ["GuildOnly", "ModuleEnabled"],
  module: "economy",
  prefixEnabled: true,
  cooldownLimit: 2,
  cooldownDelay: 5000,
})
export default class PaydayCommand extends BaseCommand {
  public override registerApplicationCommands(registry: BaseCommand.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder.setName(this.name).setDescription(this.description),
    );
  }

  public override async run(ctx: CommandContext) {
    const guildId = ctx.guildId!;
    const config = await getEconomyConfig(guildId);
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
}
