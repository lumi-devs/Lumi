import { ApplyOptions } from "@sapphire/decorators";
import { Command, container } from "@sapphire/framework";
import type { ChatInputCommandInteraction } from "discord.js";
import { BaseCommand, sendReply } from "#lib/commands.js";
import { PermissionLevel } from "#lib/permissions/index.js";
import { ephemeralCard } from "#lib/utilities/cards.js";
import { buildHubView } from "#lib/hub-panel.js";
import { loadFeatures } from "#lib/config-panel.js";

@ApplyOptions<BaseCommand.Options>({
  name: "lumi",
  description: "Open the Lumi control panel for this server",
  preconditions: ["GuildOnly"],
  permissionLevel: PermissionLevel.ADMIN,
})
export class LumiCommand extends BaseCommand {
  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder.setName(this.name).setDescription(this.description),
    );
  }

  public override async chatInputRun(interaction: ChatInputCommandInteraction) {
    const guildId = interaction.guild!.id;
    const [features, settings] = await Promise.all([
      loadFeatures(guildId),
      container.db.config.getGuildSettings(guildId),
    ]);
    return sendReply(
      interaction,
      ephemeralCard(
        buildHubView({
          moduleCount: features.length,
          enabledCount: features.filter((f) => f.guildEnabled).length,
          prefix: settings.prefix,
          locale: settings.locale,
        }),
      ),
    );
  }
}
