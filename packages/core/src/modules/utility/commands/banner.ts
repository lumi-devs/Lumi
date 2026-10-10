import { SlashCommandBuilder } from "discord.js";
import type { CommandDef } from "@lumi/lib/commands/command-def.js";
import type { CommandContext } from "@lumi/lib/commands/context.js";
import { handleMediaRequest } from "@lumi/application/services/utility/media-utils.js";

export const bannerDef: CommandDef = {
  name: "banner",
  aliases: ["b"],
  description: "Displays a user's banner.",
  guildOnly: true,
  build: () => {
    const b = new SlashCommandBuilder().setName("banner");
    return (
      b
        .setName("banner")
        .setDescription("Displays a user's banner.")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription(
              "The user whose banner to display (defaults to you).",
            ),
        )
    ) as SlashCommandBuilder;
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
