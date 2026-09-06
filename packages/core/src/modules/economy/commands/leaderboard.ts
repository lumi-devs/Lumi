import { userMention } from "@discordjs/formatters";
import { ApplyOptions } from "@sapphire/decorators";
import { BaseCommand, type CommandContext } from "#lib/commands.js";
import { paginateList } from "#lib/utilities/pagination.js";
import { BankService } from "../services/BankService.js";
import { formatAmount, getEconomyConfig } from "../index.js";
import { reportEconomyError } from "../lib/respond.js";

@ApplyOptions<BaseCommand.Options>({
  name: "leaderboard",
  description: "Show the richest members on this server.",
  preconditions: ["GuildOnly", "ModuleEnabled"],
  module: "economy",
  prefixEnabled: true,
  cooldownLimit: 2,
  cooldownDelay: 5000,
})
export default class LeaderboardCommand extends BaseCommand {
  public override registerApplicationCommands(registry: BaseCommand.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName(this.name)
        .setDescription(this.description)
        .addIntegerOption((opt) =>
          opt
            .setName("count")
            .setDescription("How many entries to show. Defaults to 10.")
            .setMinValue(1)
            .setMaxValue(50)
            .setRequired(false),
        ),
    );
  }

  public override async run(ctx: CommandContext) {
    const guildId = ctx.guildId!;
    const config = await getEconomyConfig(guildId);
    const count = (await ctx.getInteger("count")) ?? 10;
    try {
      const { entries } = await new BankService().leaderboard(
        guildId,
        Math.min(50, Math.max(1, count)),
      );
      if (entries.length === 0) {
        await ctx.replyEmpty(
          "Leaderboard",
          "Nobody has an economy account on this server yet.",
          "Claim a payday or ask staff to grant currency.",
          { ephemeral: false },
        );
        return;
      }
      const items = entries.map((entry) => {
        const marker = entry.userId === ctx.user.id ? " **← you**" : "";
        return `**#${entry.rank}** ${userMention(entry.userId)} — ${formatAmount(config, entry.total)}${marker}`;
      });
      await paginateList({
        interactionOrMessage: ctx.source,
        userId: ctx.user.id,
        title: `🏆 Richest in ${ctx.guild?.name ?? "this server"}`,
        items,
        perPage: 10,
        ephemeral: false,
      });
    } catch (err) {
      await reportEconomyError(ctx, err);
    }
  }
}
