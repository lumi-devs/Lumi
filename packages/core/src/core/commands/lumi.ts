import { ApplyOptions } from "@sapphire/decorators";
import { Command } from "@sapphire/framework";
import type { ChatInputCommandInteraction } from "discord.js";
import { BaseCommand } from "#lib/commands.js";
import { PermissionLevel, resolvePermissionLevel } from "#lib/permissions.js";
import { ephemeralCard } from "#utilities/cards.js";
import { buildHubView } from "#core/lib/hub-panel.js";
import { loadFeatures } from "#core/lib/config-panel.js";

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
    const [features, level] = await Promise.all([
      loadFeatures(interaction.guild!.id),
      resolvePermissionLevel(interaction),
    ]);
    return this.reply(
      interaction,
      ephemeralCard(
        buildHubView({
          moduleCount: features.length,
          enabledCount: features.filter((f) => f.guildEnabled).length,
          showAddons: level >= PermissionLevel.BOT_OWNER,
        }),
      ),
    );
  }
}
