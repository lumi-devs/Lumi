import { ApplyOptions } from "@sapphire/decorators";
import { type ApplicationCommandRegistry } from "@sapphire/framework";
import { BaseCommand, type CommandContext } from "#lib/commands.js";
import { PermissionLevel } from "#lib/permissions/index.js";
import { makeCard } from "#lib/utilities/cards.js";
import { Emojis } from "#lib/utilities/assets.js";
import { getAfkStats } from "../data/afk.js";

@ApplyOptions<BaseCommand.Options>({
  name: "afkstats",
  description: "Show AFK system stats (owner only).",
  permissionLevel: PermissionLevel.BOT_OWNER,
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
    const { activeEntries, activeCooldowns } = await getAfkStats();
    return ctx.reply(
      makeCard(
        0,
        `${Emojis.ANALYTICS} AFK System Stats`,
        `**Active AFK entries:** ${activeEntries}\n**Active cooldowns:** ${activeCooldowns}`,
      ),
    );
  }
}
