import { userMention } from "@discordjs/formatters";
import { ApplyOptions } from "@sapphire/decorators";
import { BaseCommand, type CommandContext } from "#lib/commands.js";
import { BankService } from "../services/BankService.js";
import { formatAmount, getEconomyConfig } from "../index.js";
import { reportEconomyError } from "../lib/respond.js";

@ApplyOptions<BaseCommand.Options>({
  name: "pay",
  description: "Transfer currency to another member. A tax may apply.",
  preconditions: ["GuildOnly", "ModuleEnabled"],
  module: "economy",
  prefixEnabled: true,
  cooldownLimit: 3,
  cooldownDelay: 5000,
})
export default class PayCommand extends BaseCommand {
  public override registerApplicationCommands(registry: BaseCommand.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName(this.name)
        .setDescription(this.description)
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
        ),
    );
  }

  public override async run(ctx: CommandContext) {
    const guildId = ctx.guildId!;
    const config = await getEconomyConfig(guildId);
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
}
