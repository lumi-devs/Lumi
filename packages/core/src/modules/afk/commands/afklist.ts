import { ApplyOptions } from "@sapphire/decorators";

import { getService } from "#lib/module-system/Service.js";
import { type ApplicationCommandRegistry } from "@sapphire/framework";
import { userMention } from "@discordjs/formatters";
import { chunk } from "@sapphire/utilities";
import { BaseCommand, type CommandContext } from "#lib/commands.js";
import { PermissionLevel } from "#lib/permissions/index.js";
import { makeWarningCard } from "#lib/utilities/cards.js";
import { afkDurationSince } from "../index.js";
import { Emojis } from "#lib/utilities/assets.js";
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
    const t = await ctx.fetchT();
    const entries = await this.afkService.getGuildEntries(ctx.guildId!);

    if (entries.length === 0) {
      return ctx.replyInfo(
        t("afk:listTitle"),
        t("afk:listEmpty"),
      );
    }

    const lines = entries.map(
      (e) =>
        `${userMention(e.userId)} — \`${e.reason}\` *${t("afk:listDuration", { duration: afkDurationSince(e.since) })}*`,
    );
    const pages = chunk(lines, 15);
    const body = pages[0]!.join("\n");
    const footer =
      pages.length > 1
        ? t("afk:listFooterPages", {
            page: 1,
            totalPages: pages.length,
            total: entries.length,
          })
        : t("afk:listFooter", { total: entries.length });
    return ctx.reply(
      makeWarningCard(`${Emojis.PAGES} ${t("afk:listTitle")}`, body, { footer }),
    );
  }
}
