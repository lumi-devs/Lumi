import { ApplyOptions } from "@sapphire/decorators";
import { type ApplicationCommandRegistry } from "@sapphire/framework";
import { BaseCommand, type CommandContext } from "#lib/commands.js";
import { makeCard } from "#lib/utilities/cards.js";
import { Emojis } from "#lib/utilities/assets.js";
import { getAfkStats } from "../data/afk.js";

@ApplyOptions<BaseCommand.Options>({
  name: "afkstats",
  description: "Show AFK system stats (owner only).",
  requiredPermit: "owner.*",
  module: "afk",
})
export default class AfkStatsCommand extends BaseCommand {
  public override registerApplicationCommands(
    registry: ApplicationCommandRegistry,
  ) {
    registry.registerChatInputCommand((b) =>
      b.setName(this.name).setDescription(this.description),
    );
  }

  public override async run(ctx: CommandContext) {
    const t = await ctx.fetchT();
    const { activeEntries, activeCooldowns } = await getAfkStats();
    return ctx.reply(
      makeCard(
        0,
        `${Emojis.ANALYTICS} ${t("afk:statsTitle")}`,
        t("afk:statsBody", { activeEntries, activeCooldowns }),
      ),
    );
  }
}
