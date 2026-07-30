import { ApplyOptions } from "@sapphire/decorators";

import { type ApplicationCommandRegistry } from "@sapphire/framework";
import { userMention } from "@discordjs/formatters";
import { chunk } from "@sapphire/utilities";
import { BaseCommand, type CommandContext } from "#lib/commands.js";
import { makeWarningCard } from "#lib/utilities/cards.js";
import { afkDurationSince } from "../index.js";
import { Emojis } from "#lib/utilities/assets.js";
import { getAfkEntriesForGuild } from "../data/afk.js";

@ApplyOptions<BaseCommand.Options>({
  name: "afklist",
  description: "List users currently AFK in this server (owner only).",
  preconditions: ["GuildOnly"],
  requiredPermit: "owner.*",
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

  public override async run(ctx: CommandContext) {
    const t = await ctx.fetchT();
    const entries = await getAfkEntriesForGuild(ctx.guildId!);

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
