import { ApplyOptions } from "@sapphire/decorators";
import { Command } from "@sapphire/framework";
import type { ChatInputCommandInteraction } from "discord.js";
import { BaseCommand } from "#lib/commands.js";
import { PermissionLevel } from "#lib/permissions.js";
import { ephemeralCard } from "#utilities/cards.js";
import { buildFeatureListView, loadFeatures } from "#core/lib/config-panel.js";

@ApplyOptions<BaseCommand.Options>({
  name: "config",
  description: "Open the interactive configuration panel for this server",
  preconditions: ["GuildOnly"],
  permissionLevel: PermissionLevel.ADMIN,
})
export class ConfigCommand extends BaseCommand {
  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName(this.name)
        .setDescription(this.description)
        .setDefaultMemberPermissions(this.defaultMemberPermissions ?? null)
        .setContexts(...this.contexts)
        .setIntegrationTypes(this.integrationTypes),
    );
  }

  public override async chatInputRun(interaction: ChatInputCommandInteraction) {
    const features = await loadFeatures(interaction.guild!.id);
    return interaction.reply(ephemeralCard(buildFeatureListView(features)));
  }
}
