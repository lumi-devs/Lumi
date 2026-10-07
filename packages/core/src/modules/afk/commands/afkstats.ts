import { SlashCommandBuilder } from "discord.js";
import type { CommandDef } from "#lib/commands/command-def.js";
import type { CommandContext } from "#lib/command-context.js";
import { makeCard } from "#lib/ui/cards.js";
import { Emojis } from "#lib/utilities/assets.js";
import { getAfkStats } from "../data/afk.js";

export const afkstatsDef: CommandDef = {
  name: "afkstats",
  module: "afk",
  description: "Show AFK system stats (owner only).",
  guildOnly: true,
  requiredPermit: "owner.*",
  build: () => {
    const b = new SlashCommandBuilder().setName("afkstats");
    return (
    b.setName("afkstats").setDescription("Show AFK system stats (owner only).")
    );
  },
  run: async (ctx: CommandContext) => {
    const t = await ctx.fetchT();
    const { activeEntries, activeCooldowns } = await getAfkStats(ctx.services);
    return ctx.reply(
      makeCard(
        0,
        `${Emojis.Analytics} ${t("afk:statsTitle")}`,
        t("afk:statsBody", { activeEntries, activeCooldowns }),
      ),
    );
  }
};
