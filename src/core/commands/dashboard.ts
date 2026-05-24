import { ApplyOptions } from "@sapphire/decorators";
import { ApplicationCommandRegistry } from "@sapphire/framework";
import { Subcommand } from "@sapphire/plugin-subcommands";
import { EmberSubcommand } from "#lib/commands.js";
import { PermissionLevel } from "#lib/permissions.js";
import { MessageFlags, ApplicationIntegrationType } from "discord.js";
import { ephemeralCard, makeSuccessCard } from "#utilities/cards.js";
import { EmberEmojis } from "#utilities/assets.js";

@ApplyOptions<EmberSubcommand.Options>({
  name: "dashboard",
  description: "Manage dashboard configuration and layout",
  preconditions: ["GuildOnly"],
  permissionLevel: PermissionLevel.GUILD_OWNER,
  subcommands: [{ name: "layout", chatInputRun: "chatInputLayout" }],
})
export class DashboardCommand extends EmberSubcommand {
  public override registerApplicationCommands(
    registry: ApplicationCommandRegistry,
  ): void {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName("dashboard")
        .setDescription("Manage dashboard configuration and layout")
        .setDefaultMemberPermissions(this.defaultMemberPermissions ?? null)
        .setContexts(...this.contexts)
        .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
        .addSubcommand((sub) =>
          sub
            .setName("layout")
            .setDescription("Set the widget layout for the dashboard")
            .addStringOption((opt) =>
              opt
                .setName("layout")
                .setDescription("JSON array of module widgets")
                .setRequired(true),
            ),
        ),
    );
  }

  private get guildSettingsService(): import("#core/services/GuildSettingsService.js").GuildSettingsService {
    return this.container.stores
      .get("services")
      .get(
        "guild-settings",
      ) as import("#core/services/GuildSettingsService.js").GuildSettingsService;
  }

  public async chatInputLayout(
    interaction: Subcommand.ChatInputCommandInteraction,
  ): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const guildId = interaction.guild!.id;
    const rawLayout = interaction.options.getString("layout", true);

    try {
      const layout = await this.guildSettingsService.setDashboardLayout(
        guildId,
        rawLayout,
      );
      this.container.logger.info(
        `[Dashboard] ${EmberEmojis.GEAR} Layout updated for guild ${guildId} by ${interaction.user.tag}`,
      );
      await this.reply(
        interaction,
        ephemeralCard(
          makeSuccessCard(
            `${EmberEmojis.GEAR} Layout Updated`,
            `Dashboard layout updated successfully to: \`${JSON.stringify(layout)}\``,
          ),
        ),
      );
    } catch (err: unknown) {
      const error = err as Error;
      return this.replyError(interaction, "Validation Failed", error.message, {
        ephemeral: true,
      });
    }
  }
}
