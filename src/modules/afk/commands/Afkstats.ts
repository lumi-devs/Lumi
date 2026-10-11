import { SlashCommandBuilder } from "discord.js";
import type { CommandDef } from "#src/lib/commands/CommandDef.js";
import type { CommandContext } from "#src/lib/commands/Context.js";
import { makeCard } from "#src/lib/ui/Cards.js";
import { getAfkStats } from "#src/modules/afk/data/Afk.js";

export const afkstatsDef: CommandDef = {
  name: "afkstats",
  module: "afk",
  description: "Show AFK system stats (owner only).",
  guildOnly: true,
  requiredPermit: "owner.*",
  build: () => {
    const b = new SlashCommandBuilder().setName("afkstats");
    return b.setDescription("Show AFK system stats (owner only).");
  },
  run: async (ctx: CommandContext) => {
    const t = await ctx.fetchT();
    const { activeEntries, activeCooldowns } = await getAfkStats(ctx.services);
    return ctx.reply(
      makeCard(
        0,
        `📊 ${t("afk:statsTitle")}`,
        t("afk:statsBody", { activeEntries, activeCooldowns }),
      ),
    );
  }
};
