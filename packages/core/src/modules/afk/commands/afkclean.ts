import { ApplyOptions } from "@sapphire/decorators";
import { getService } from "#core/module-system/Service.js";

import type { Message } from "discord.js";
import { BaseCommand } from "#lib/commands.js";
import { PermissionLevel } from "#lib/permissions.js";
import { makeInfoCard, makeSuccessCard } from "#utilities/cards.js";
import type AfkService from "../services/AfkService.js";

@ApplyOptions<BaseCommand.Options>({
  name: "afkclean",
  description:
    "Remove AFK entries whose users are no longer cached (owner only).",
  permissionLevel: PermissionLevel.BOT_OWNER,
  module: "afk",
})
export default class AfkCleanCommand extends BaseCommand {
  private get afkService(): AfkService {
    return getService("afk");
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
