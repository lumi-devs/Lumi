import { ApplyOptions } from "@sapphire/decorators";
import { Args, Command } from "@sapphire/framework";
import { Message, type ChatInputCommandInteraction } from "discord.js";
import { BaseCommand } from "#lib/commands.js";
import { handleMediaRequest } from "../media-utils.js";

@ApplyOptions<BaseCommand.Options>({
  name: "avatar",
  aliases: ["av"],
  description: "Displays a user's avatar.",
  preconditions: ["GuildOnly"],
})
export class AvatarCommand extends BaseCommand {
  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName(this.name)
        .setDescription(this.description)
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription(
              "The user whose avatar to display (defaults to you).",
            ),
        ),
    );
  }

  public override async messageRun(message: Message, args: Args) {
    const user = await args.pick("user").catch(() => message.author);
    return handleMediaRequest({
      context: message,
      targetUser: user,
      mediaType: "avatar",
      container: this.container,
    });
  }

  public override async chatInputRun(interaction: ChatInputCommandInteraction) {
    const user = interaction.options.getUser("user") ?? interaction.user;
    return handleMediaRequest({
      context: interaction,
      targetUser: user,
      mediaType: "avatar",
      container: this.container,
    });
  }
}
