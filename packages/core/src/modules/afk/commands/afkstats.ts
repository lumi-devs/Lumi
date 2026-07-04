import { ApplyOptions } from "@sapphire/decorators";
import { getService } from "#core/module-system/Service.js";
import { type ApplicationCommandRegistry } from "@sapphire/framework";
import { BaseCommand, type CommandContext } from "#lib/commands.js";
import { PermissionLevel } from "#lib/permissions.js";
import { Colors } from "#utilities/branding.js";
import { makeCard } from "#utilities/cards.js";
import { Emojis } from "#utilities/assets.js";
import type AfkService from "../services/AfkService.js";

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

  private get afkService(): AfkService {
    return getService("afk");
  }

  public override async run(ctx: CommandContext) {
    const { activeEntries, activeCooldowns } =
      await this.afkService.getAfkStats();
    return ctx.reply(
      makeCard(
        Colors.PRIMARY,
        `${Emojis.ANALYTICS} AFK System Stats`,
        `**Active AFK entries:** ${activeEntries}\n**Active cooldowns:** ${activeCooldowns}`,
      ),
    );
  }
}
