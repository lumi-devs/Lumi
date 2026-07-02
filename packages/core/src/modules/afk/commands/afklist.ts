import { ApplyOptions } from "@sapphire/decorators";
import { userMention } from "@discordjs/formatters";
import { chunk } from "@sapphire/utilities";
import type { Message } from "discord.js";
import { BaseCommand } from "#lib/commands.js";
import { PermissionLevel } from "#lib/permissions.js";
import { makeInfoCard, makeWarningCard } from "#utilities/cards.js";
import { afkDurationSince } from "../index.js";
import { Emojis } from "#utilities/assets.js";
import type AfkService from "../services/AfkService.js";

@ApplyOptions<BaseCommand.Options>({
  name: "afklist",
  description: "List users currently AFK in this server (owner only).",
  preconditions: ["GuildOnly"],
  permissionLevel: PermissionLevel.BOT_OWNER,
  module: "afk",
})
export default class AfkListCommand extends BaseCommand {
  private get afkService(): AfkService {
    return this.container.stores.get("services").get("afk") as AfkService;
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
        `${userMention(e.userId)} — \`${e.reason}\` *(for ${afkDurationSince(e.since)})*`,
    );
    const pages = chunk(lines, 15);
    const body = pages[0]!.join("\n");
    const footer =
      pages.length > 1
        ? `Page 1/${pages.length} • Total AFK in this server: ${entries.length}`
        : `Total AFK in this server: ${entries.length}`;
    return message.reply({
      ...makeWarningCard(`${Emojis.PAGES} AFK List`, body, { footer }),
    });
  }
}
