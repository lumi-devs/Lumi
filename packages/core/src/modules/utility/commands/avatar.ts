import { SlashCommandBuilder } from "discord.js";
import type { CommandDef } from "@lumi/lib/commands/command-def.js";
import type { CommandContext } from "@lumi/lib/commands/context.js";
import { handleMediaRequest } from "@lumi/application/services/utility/media-utils.js";

export const avatarDef: CommandDef = {
  name: "avatar",
  aliases: ["av"],
  description: "Displays a user's avatar.",
  guildOnly: true,
  build: () => {
    const b = new SlashCommandBuilder().setName("avatar");
    return (
      b
        .setName("avatar")
        .setDescription("Displays a user's avatar.")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription(
              "The user whose avatar to display (defaults to you).",
            ),
        )
    ) as SlashCommandBuilder;
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
