import { ApplyOptions } from "@sapphire/decorators";
import { ApplicationCommandRegistry } from "@sapphire/framework";
import { EmberSubcommand } from "#lib/commands.js";
import { PermissionLevel } from "#lib/permissions.js";
import { MessageFlags, ApplicationIntegrationType } from "discord.js";
import {
  ephemeralCard,
  makeSuccessCard,
  makeErrorCard,
} from "#utilities/cards.js";
import { EmberEmojis } from "#utilities/assets.js";
import { Subcommand } from "@sapphire/plugin-subcommands";

@ApplyOptions<EmberSubcommand.Options>({
  name: "module",
  description: "Manage installation of third-party modules",
  preconditions: ["GuildOnly"],
  permissionLevel: PermissionLevel.BOT_OWNER,
  subcommands: [
    { name: "install", chatInputRun: "chatInputInstall" },
    { name: "uninstall", chatInputRun: "chatInputUninstall" },
  ],
})
export class ModuleCommand extends EmberSubcommand {
  public override registerApplicationCommands(
    registry: ApplicationCommandRegistry,
  ): void {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName("module")
        .setDescription(
          "Manage installation of third-party modules (Bot Owner Only)",
        )
        .setDefaultMemberPermissions(this.defaultMemberPermissions ?? null)
        .setContexts(...this.contexts)
        .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
        .addSubcommand((sub) =>
          sub
            .setName("install")
            .setDescription("Install a module from an added repository")
            .addStringOption((opt) =>
              opt
                .setName("repo")
                .setDescription("The repository name")
                .setRequired(true),
            )
            .addStringOption((opt) =>
              opt
                .setName("module")
                .setDescription("The module name")
                .setRequired(true),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("uninstall")
            .setDescription("Uninstall a third-party module")
            .addStringOption((opt) =>
              opt
                .setName("module")
                .setDescription("The module name")
                .setRequired(true),
            ),
        ),
    );
  }

  private get downloaderService(): import("#core/services/DownloaderService.js").DownloaderService {
    return this.container.stores
      .get("services")
      .get(
        "downloader",
      ) as import("#core/services/DownloaderService.js").DownloaderService;
  }

  public async chatInputInstall(
    interaction: Subcommand.ChatInputCommandInteraction,
  ): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const repoName = interaction.options.getString("repo", true);
    const moduleName = interaction.options.getString("module", true);

    try {
      await this.downloaderService.installModule(repoName, moduleName);
      this.container.logger.debug(
        `[Module] ${EmberEmojis.INSTALL} Installed: ${moduleName} from ${repoName} by ${interaction.user.tag}`,
      );
      await this.reply(
        interaction,
        ephemeralCard(
          makeSuccessCard(
            `${EmberEmojis.INSTALL} Module Installed`,
            `Successfully installed and loaded **${moduleName}** from **${repoName}**.`,
          ),
        ),
      );
    } catch (err: unknown) {
      const error = err as Error;
      this.container.logger.warn(
        `[Module] ${EmberEmojis.ERROR} Install failed: ${moduleName} — ${error.message}`,
      );
      await this.reply(
        interaction,
        ephemeralCard(
          makeErrorCard(
            `${EmberEmojis.ERROR} Failed to Install Module`,
            error.message,
          ),
        ),
      );
    }
  }

  public async chatInputUninstall(
    interaction: Subcommand.ChatInputCommandInteraction,
  ): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const moduleName = interaction.options.getString("module", true);

    try {
      await this.downloaderService.uninstallModule(moduleName);
      this.container.logger.debug(
        `[Module] ${EmberEmojis.UNINSTALL} Uninstalled: ${moduleName} by ${interaction.user.tag}`,
      );
      await this.reply(
        interaction,
        ephemeralCard(
          makeSuccessCard(
            `${EmberEmojis.UNINSTALL} Module Uninstalled`,
            `Successfully uninstalled **${moduleName}**.`,
          ),
        ),
      );
    } catch (err: unknown) {
      const error = err as Error;
      this.container.logger.warn(
        `[Module] ${EmberEmojis.ERROR} Uninstall failed: ${moduleName} — ${error.message}`,
      );
      await this.reply(
        interaction,
        ephemeralCard(
          makeErrorCard(
            `${EmberEmojis.ERROR} Failed to Uninstall Module`,
            error.message,
          ),
        ),
      );
    }
  }
}
