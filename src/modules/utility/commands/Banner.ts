import { SlashCommandBuilder } from "discord.js";
import type { CommandDef } from "#src/lib/commands/CommandDef.js";
import type { CommandContext } from "#src/lib/commands/Context.js";
import { handleMediaRequest } from "#src/modules/utility/services/MediaUtils.js";

export const bannerDef: CommandDef = {
  name: "banner",
  aliases: ["b"],
  description: "Displays a user's banner.",
  guildOnly: true,
  build: () => {
    const b = new SlashCommandBuilder().setName("banner");
    return b
      .setDescription("Displays a user's banner.")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription(
            "The user whose banner to display (defaults to you).",
          ),
      );
  },
  run: async (ctx: CommandContext) => {
    const user = (await ctx.getUser("user")) ?? ctx.user;
    return handleMediaRequest({
      context: ctx.source,
      targetUser: user,
      mediaType: "banner",
      container: ctx.services,
    });
  },
};
