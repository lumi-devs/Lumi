import { SlashCommandBuilder } from "discord.js";
import type { CommandDef } from "@commands/CommandDef.js";

import { userMention } from "@discordjs/formatters";
import type { CommandContext } from "@commands/Context.js";
import { paginateList } from "@utilities/Pagination.js";
import { afkDurationSince } from "@modules/afk/services/Format.js";
import { getAfkEntriesForGuild } from "@modules/afk/data/Afk.js";

export const afklistDef: CommandDef = {
  name: "afklist",
  module: "afk",
  description: "List users currently AFK in this server (server owner only).",
  guildOnly: true,
  guildOwner: true,
  build: () => {
    const b = new SlashCommandBuilder().setName("afklist");
    return b
      .setDescription("List users currently AFK in this server (server owner only).");
  },
  run: async (ctx: CommandContext) => {
    const t = await ctx.fetchT();
    const entries = await getAfkEntriesForGuild(ctx.services, ctx.guildId!);

    if (entries.length === 0) {
      return ctx.replyInfo(t("afk:listTitle"), t("afk:listEmpty"));
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
};
