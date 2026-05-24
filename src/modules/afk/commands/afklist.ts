import { ApplyOptions } from "@sapphire/decorators";

import type { Message } from "discord.js";
import { EmberCommand } from "#lib/commands.js";
import { PermissionLevel } from "#lib/permissions.js";
import { makeInfoCard, makeWarningCard } from "#utilities/cards.js";
import { afkDurationSince } from "../index.js";
import { EmberEmojis } from "#utilities/assets.js";

@ApplyOptions<EmberCommand.Options>({
  name: "afklist",
  description: "List users currently AFK in this server (owner only).",
  preconditions: ["GuildOnly"],
  permissionLevel: PermissionLevel.BOT_OWNER,
  module: "afk",
})
export default class AfkListCommand extends EmberCommand {
  private get afkService(): import("../services/AfkService.js").default {
    return this.container.stores
      .get("services")
      .get("afk") as import("../services/AfkService.js").default;
  }

  public override async messageRun(message: Message) {
    if (!message.inGuild()) return;
    const entries = await this.afkService.getAfkList(message.guildId);

    if (entries.length === 0) {
      return message.reply({
        ...makeInfoCard(
          "AFK List",
          "No users are currently AFK in this server.",
        ),
      });
    }

    const lines = entries.map(
      (e) =>
        `<@${e.userId}> — \`${e.reason}\` *(for ${afkDurationSince(e.since)})*`,
    );
    return message.reply({
      ...makeWarningCard(`${EmberEmojis.PAGES} AFK List`, lines.join("\n"), {
        footer: `Total AFK in this server: ${entries.length}`,
      }),
    });
  }
}
