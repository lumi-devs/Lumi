import { SlashCommandBuilder } from "discord.js";
import type { CommandDef } from "@lumi/lib/commands/command-def.js";

import { userMention } from "@discordjs/formatters";
import type { CommandContext } from "@lumi/lib/commands/context.js";
import { paginateList } from "@lumi/lib/utilities/pagination.js";
import { afkDurationSince } from "@lumi/application/services/afk/format.js";
import { getAfkEntriesForGuild } from "../data/afk.js";

export const afklistDef: CommandDef = {
  name: "afklist",
  module: "afk",
  description: "List users currently AFK in this server (owner only).",
  guildOnly: true,
  requiredPermit: "owner.*",
  build: () => {
    const b = new SlashCommandBuilder().setName("afklist");
    return (
    b.setName("afklist").setDescription("List users currently AFK in this server (owner only).")
    );
  },
  run: async (ctx: CommandContext) => {
    const t = await ctx.fetchT();
    const entries = await getAfkEntriesForGuild(ctx.services, ctx.guildId!);

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
};
