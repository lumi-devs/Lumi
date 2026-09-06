import { ApplyOptions } from "@sapphire/decorators";
import { BaseCommand, type CommandContext } from "#lib/commands.js";
import { BankService } from "../services/BankService.js";
import { formatAmount, getEconomyConfig } from "../index.js";
import { reportEconomyError } from "../lib/respond.js";

@ApplyOptions<BaseCommand.Options>({
  name: "balance",
  description: "Show wallet and bank balances.",
  preconditions: ["GuildOnly", "ModuleEnabled"],
  module: "economy",
  prefixEnabled: true,
  cooldownLimit: 3,
  cooldownDelay: 5000,
})
export default class BalanceCommand extends BaseCommand {
  public override registerApplicationCommands(registry: BaseCommand.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName(this.name)
        .setDescription(this.description)
        .addUserOption((opt) =>
          opt
            .setName("user")
            .setDescription("Whose balance to show. Defaults to you.")
            .setRequired(false),
        ),
    );
  }

  public override async run(ctx: CommandContext) {
    const guildId = ctx.guildId!;
    const config = await getEconomyConfig(guildId);
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
}
