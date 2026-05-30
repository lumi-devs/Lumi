import { ApplyOptions } from "@sapphire/decorators";

import type { Message } from "discord.js";
import { BaseCommand } from "#lib/commands.js";
import { PermissionLevel } from "#lib/permissions.js";
import { Colors } from "#utilities/branding.js";
import { makeCard } from "#utilities/cards.js";
import { Emojis } from "#utilities/assets.js";

@ApplyOptions<BaseCommand.Options>({
  name: "afkstats",
  description: "Show AFK system stats (owner only).",
  permissionLevel: PermissionLevel.BOT_OWNER,
  module: "afk",
})
export default class AfkStatsCommand extends BaseCommand {
  private get afkService(): import("../services/AfkService.js").default {
    return this.container.stores
      .get("services")
      .get("afk") as import("../services/AfkService.js").default;
  }

  public override async messageRun(message: Message) {
    const { activeEntries, activeCooldowns } =
      await this.afkService.getAfkStats();
    return message.reply({
      ...makeCard(
        Colors.PRIMARY,
        `${Emojis.ANALYTICS} AFK System Stats`,
        `**Active AFK entries:** ${activeEntries}\n**Active cooldowns:** ${activeCooldowns}`,
      ),
    });
  }
}
