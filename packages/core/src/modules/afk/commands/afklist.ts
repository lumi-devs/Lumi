import { ApplyOptions } from "@sapphire/decorators";
import { getService } from "#core/module-system/Service.js";
import { type ApplicationCommandRegistry } from "@sapphire/framework";
import { userMention } from "@discordjs/formatters";
import { chunk } from "@sapphire/utilities";
import { BaseCommand, type CommandContext } from "#lib/commands.js";
import { PermissionLevel } from "#lib/permissions.js";
import { makeWarningCard } from "#utilities/cards.js";
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
    const entries = await this.afkService.getAfkList(ctx.guildId!);

    if (entries.length === 0) {
      return ctx.replyInfo(
        "AFK List",
        "No users are currently AFK in this server.",
      );
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
    return ctx.reply(
      makeWarningCard(`${Emojis.PAGES} AFK List`, body, { footer }),
    );
  }
}
