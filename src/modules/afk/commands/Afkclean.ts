import { SlashCommandBuilder } from "discord.js";
import type { CommandDef } from "#src/lib/commands/CommandDef.js";
import { getUtility } from "#src/lib/module-system/Utility.js";
import type { CommandContext } from "#src/lib/commands/Context.js";
import type { AfkUtility } from "#src/modules/afk/utilities/AfkUtility.js";

function afkService(): AfkUtility {
  return getUtility("afk");
}

export const afkcleanDef: CommandDef = {
  name: "afkclean",
  module: "afk",
  description: "Remove AFK entries whose users are no longer cached (server owner only).",
  guildOnly: true,
  guildOwner: true,
  build: () => {
    const b = new SlashCommandBuilder().setName("afkclean");
    return b
      .setDescription("Remove AFK entries whose users are no longer cached (server owner only).");
  },
  run: async (ctx: CommandContext) => {
    const t = await ctx.fetchT();
    await ctx.defer();
    const removed = await afkService().cleanStaleEntries(ctx.services);
    return ctx.replySuccess(
      t("afk:cleanTitle"),
      t("afk:cleanSuccess", { count: removed }),
    );
  }
};
