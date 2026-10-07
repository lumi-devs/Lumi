import { SlashCommandBuilder } from "discord.js";
import type { CommandDef } from "#lib/commands/command-def.js";
import { getUtility } from "#lib/module-system/Utility.js";
import type { CommandContext } from "#lib/command-context.js";
import type { AfkUtility } from "../utilities/AfkUtility.js";

function afkService(): AfkUtility {
  return getUtility("afk");
}

export const afkcleanDef: CommandDef = {
  name: "afkclean",
  module: "afk",
  description: "Remove AFK entries whose users are no longer cached (owner only).",
  guildOnly: true,
  requiredPermit: "owner.*",
  build: () => {
    const b = new SlashCommandBuilder().setName("afkclean");
    return (
    b.setName("afkclean").setDescription("Remove AFK entries whose users are no longer cached (owner only).")
    );
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
