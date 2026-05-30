import { ApplyOptions } from "@sapphire/decorators";

import type { Message } from "discord.js";
import { BaseCommand } from "#lib/commands.js";
import { PermissionLevel } from "#lib/permissions.js";
import { makeInfoCard, makeSuccessCard } from "#utilities/cards.js";

@ApplyOptions<BaseCommand.Options>({
  name: "afkclean",
  description:
    "Remove AFK entries whose users are no longer cached (owner only).",
  permissionLevel: PermissionLevel.BOT_OWNER,
  module: "afk",
})
export default class AfkCleanCommand extends BaseCommand {
  private get afkService(): import("../services/AfkService.js").default {
    return this.container.stores
      .get("services")
      .get("afk") as import("../services/AfkService.js").default;
  }

  public override async messageRun(message: Message) {
    if (message.channel.isSendable()) {
      void message.channel.send({
        ...makeInfoCard("AFK Cleanup", "Cleaning up AFK entries…"),
      });
    }

    const removed = await this.afkService.cleanStaleEntries();

    return message.reply({
      ...makeSuccessCard(
        "AFK Cleanup",
        `Removed ${removed} stale AFK entries.`,
      ),
    });
  }
}
