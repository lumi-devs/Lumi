import { SlashCommandBuilder } from "discord.js";
import type { CommandDef } from "#src/lib/commands/CommandDef.js";
import type { CommandContext } from "#src/lib/commands/Context.js";
import { handleMediaRequest } from "#src/modules/utility/services/MediaUtils.js";

export const avatarDef: CommandDef = {
  name: "avatar",
  aliases: ["av"],
  description: "Displays a user's avatar.",
  guildOnly: true,
  build: () => {
    const b = new SlashCommandBuilder().setName("avatar");
    return b
      .setDescription("Displays a user's avatar.")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription(
            "The user whose avatar to display (defaults to you).",
          ),
      );
  },
  run: async (ctx: CommandContext) => {
    const user = (await ctx.getUser("user")) ?? ctx.user;
    return handleMediaRequest({
      context: ctx.source,
      targetUser: user,
      mediaType: "avatar",
      container: ctx.services,
    });
  },
};
