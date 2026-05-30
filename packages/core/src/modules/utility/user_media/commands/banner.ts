import { ApplyOptions } from "@sapphire/decorators";
import { Args, Command } from "@sapphire/framework";
import { Message, type ChatInputCommandInteraction } from "discord.js";
import { BaseCommand } from "#lib/commands.js";
import { handleMediaRequest } from "../media-utils.js";

@ApplyOptions<BaseCommand.Options>({
  name: "banner",
  aliases: ["b"],
  description: "Displays a user's banner.",
  preconditions: ["GuildOnly"],
})
export class BannerCommand extends BaseCommand {
  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName(this.name)
        .setDescription(this.description)
        .setDefaultMemberPermissions(this.defaultMemberPermissions ?? null)
        .setContexts(...this.contexts)
        .setIntegrationTypes(this.integrationTypes)
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription(
              "The user whose banner to display (defaults to you).",
            ),
        ),
    );
  }

  public override async messageRun(message: Message, args: Args) {
    const user = await args.pick("user").catch(() => message.author);
    return handleMediaRequest({
      context: message,
      targetUser: user,
      mediaType: "banner",
      container: this.container,
    });
  }

  public override async chatInputRun(interaction: ChatInputCommandInteraction) {
    const user = interaction.options.getUser("user") ?? interaction.user;
    return handleMediaRequest({
      context: interaction,
      targetUser: user,
      mediaType: "banner",
      container: this.container,
    });
  }
}
