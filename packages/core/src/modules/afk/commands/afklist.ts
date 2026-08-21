import { ApplyOptions } from "@sapphire/decorators";

import { type ApplicationCommandRegistry } from "@sapphire/framework";
import { userMention } from "@discordjs/formatters";
import { BaseCommand, type CommandContext } from "#lib/commands.js";
import { paginateList } from "#lib/utilities/pagination.js";
import { afkDurationSince } from "../index.js";
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
        `${userMention(e.userId)} - \`${e.reason}\` *${t("afk:listDuration", { duration: afkDurationSince(e.since) })}*`,
    );
    return paginateList({
      interactionOrMessage: ctx.source,
      userId: ctx.user.id,
      title: t("afk:listTitle"),
      items: lines,
      perPage: 15,
    });
  }
}
