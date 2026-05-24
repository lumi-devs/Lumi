import { ApplyOptions } from "@sapphire/decorators";
import { ApplicationCommandRegistry, container } from "@sapphire/framework";
import {
  ApplicationIntegrationType,
  type ChatInputCommandInteraction,
} from "discord.js";
import { EmberSubcommand } from "#lib/commands.js";
import { PermissionLevel } from "#lib/permissions.js";
import { makeSuccessCard } from "#utilities/cards.js";
import { EmberEmojis } from "#utilities/assets.js";

import { Subcommand } from "@sapphire/plugin-subcommands";

@ApplyOptions<Subcommand.Options>({
  name: "prefix",
  description: "View or change the command prefix for this server",
  preconditions: ["GuildOnly"],
  subcommands: [
    { name: "view", chatInputRun: "chatInputView" },
    { name: "set", chatInputRun: "chatInputSet" },
    { name: "reset", chatInputRun: "chatInputReset" },
  ],
})
export class PrefixCommand extends EmberSubcommand {
  public override registerApplicationCommands(
    registry: ApplicationCommandRegistry,
  ) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName(this.name)
        .setDescription(this.description)
        .setDefaultMemberPermissions(this.defaultMemberPermissions ?? null)
        .setContexts(...this.contexts)
        .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
        .addSubcommand((sub) =>
          sub
            .setName("set")
            .setDescription("Set a new prefix")
            .addStringOption((opt) =>
              opt
                .setName("new_prefix")
                .setDescription("The new prefix (max 5 chars)")
                .setRequired(true),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("reset")
            .setDescription("Reset the prefix to the default"),
        )
        .addSubcommand((sub) =>
          sub.setName("view").setDescription("View the current prefix"),
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

  public async chatInputView(interaction: ChatInputCommandInteraction) {
    const guildId = interaction.guildId!;
    const settings = await container.db.getGuildSettings(guildId);
    return interaction.reply(
      makeSuccessCard(
        "Current Prefix",
        `The current prefix for this server is \`${settings.prefix ?? ","}\`.`,
      ),
    );
  }

  public async chatInputSet(interaction: ChatInputCommandInteraction) {
    await this.checkPermission(interaction, PermissionLevel.ADMIN);
    const guildId = interaction.guildId!;
    const newPrefix = interaction.options.getString("new_prefix", true);

    try {
      await this.guildSettingsService.setPrefix(guildId, newPrefix);
      this.container.logger.debug(
        `[Prefix] ${EmberEmojis.GEAR} Guild ${guildId} prefix changed to '${newPrefix}' by ${interaction.user.tag}`,
      );
      return interaction.reply(
        makeSuccessCard(
          `${EmberEmojis.GEAR} Prefix Updated`,
          `The prefix for this server has been set to \`${newPrefix}\`.`,
        ),
      );
    } catch (err: unknown) {
      const error = err as Error;
      return this.replyError(interaction, "Update Failed", error.message, {
        ephemeral: true,
      });
    }
  }

  public async chatInputReset(interaction: ChatInputCommandInteraction) {
    await this.checkPermission(interaction, PermissionLevel.ADMIN);
    const guildId = interaction.guildId!;

    await this.guildSettingsService.resetPrefix(guildId);
    this.container.logger.debug(
      `[Prefix] ${EmberEmojis.GEAR} Guild ${guildId} prefix reset by ${interaction.user.tag}`,
    );
    return interaction.reply(
      makeSuccessCard(
        `${EmberEmojis.GEAR} Prefix Reset`,
        "The prefix for this server has been reset to the default.",
      ),
    );
  }
}
