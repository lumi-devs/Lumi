import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { CommandDef } from "#src/lib/commands/CommandDef.js";
import type { CommandContext } from "#src/lib/commands/Context.js";
import { makeCard } from "#src/lib/ui/Cards.js";
import { getAfkStatsForGuild } from "#src/modules/afk/data/Afk.js";

export const afkstatsDef: CommandDef = {
  name: "afkstats",
  module: "afk",
  description: "Show AFK stats for this server (server owner only).",
  guildOnly: true,
  defaultMemberPermissions: PermissionFlagsBits.Administrator,
  build: () => {
    const b = new SlashCommandBuilder().setName("afkstats");
    return b
      .setDescription("Show AFK stats for this server (server admin only).");
  },
  run: async (ctx: CommandContext) => {
    if (ctx.guild?.ownerId !== ctx.user.id) {
      await ctx.replyError(
        "Server Owner Only",
        "Only the server owner can use this command.",
      );
      return;
    }
    const t = await ctx.fetchT();
    const { activeEntries, activeCooldowns } = await getAfkStatsForGuild(
      ctx.services,
      ctx.guildId!,
    );
    return ctx.reply(
      makeCard(
        0,
        `📊 ${t("afk:statsTitle")}`,
        t("afk:statsBody", { activeEntries, activeCooldowns }),
      ),
    );
  }
};
