import { ApplyOptions } from "@sapphire/decorators";
import {
  ApplicationCommandRegistry,
  container,
  type Args,
} from "@sapphire/framework";
import {
  ApplicationIntegrationType,
  type ChatInputCommandInteraction,
  type Message,
} from "discord.js";
import { BaseSubcommand } from "#lib/commands.js";
import { PermissionLevel, resolvePermissionLevel } from "#lib/permissions.js";
import {
  makeSuccessCard,
  makeErrorCard,
  ephemeralCard,
} from "#utilities/cards.js";
import { Emojis } from "#utilities/assets.js";

@ApplyOptions<BaseSubcommand.Options>({
  name: "prefix",
  description: "View or change the command prefix for this server",
  preconditions: ["GuildOnly"],
  subcommands: [
    {
      name: "view",
      messageRun: "messageRunView",
      chatInputRun: "chatInputView",
    },
    { name: "set", messageRun: "messageRunSet", chatInputRun: "chatInputSet" },
    {
      name: "reset",
      messageRun: "messageRunReset",
      chatInputRun: "chatInputReset",
    },
  ],
})
export class PrefixCommand extends BaseSubcommand {
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

  public async messageRunView(message: Message) {
    const guildId = message.guildId!;
    const settings = await container.db.config.getGuildSettings(guildId);
    return message.reply(
      makeSuccessCard(
        "Current Prefix",
        `The current prefix for this server is \`${settings.prefix ?? ","}\`.`,
      ),
    );
  }

  public async messageRunSet(message: Message, args: Args) {
    const actual = await resolvePermissionLevel(message);
    if (actual < PermissionLevel.ADMIN) {
      return message.reply(
        makeErrorCard(
          "Permission Denied",
          "You need at least **Administrator** level to use this.",
        ),
      );
    }

    const guildId = message.guildId!;
    const newPrefix = await args.pick("string").catch(() => null);

    if (!newPrefix) {
      return message.reply(
        makeErrorCard("Missing Arguments", "Usage: `,prefix set <new_prefix>`"),
      );
    }

    if (newPrefix.length > 5) {
      return message.reply(
        makeErrorCard("Invalid Prefix", "Prefix must be 5 characters or less."),
      );
    }

    await this.guildSettingsService.setPrefix(guildId, newPrefix);
    this.container.logger.debug(
      `[Prefix] ${Emojis.GEAR} Guild ${guildId} prefix changed to '${newPrefix}' by ${message.author.tag}`,
    );
    return message.reply(
      makeSuccessCard(
        `${Emojis.GEAR} Prefix Updated`,
        `The prefix for this server has been set to \`${newPrefix}\`.`,
      ),
    );
  }

  public async messageRunReset(message: Message) {
    const actual = await resolvePermissionLevel(message);
    if (actual < PermissionLevel.ADMIN) {
      return message.reply(
        makeErrorCard(
          "Permission Denied",
          "You need at least **Administrator** level to use this.",
        ),
      );
    }

    const guildId = message.guildId!;

    await this.guildSettingsService.resetPrefix(guildId);
    this.container.logger.debug(
      `[Prefix] ${Emojis.GEAR} Guild ${guildId} prefix reset by ${message.author.tag}`,
    );
    return message.reply(
      makeSuccessCard(
        `${Emojis.GEAR} Prefix Reset`,
        "The prefix for this server has been reset to the default.",
      ),
    );
  }

  public async chatInputView(interaction: ChatInputCommandInteraction) {
    const guildId = interaction.guildId!;
    const settings = await container.db.config.getGuildSettings(guildId);
    return interaction.reply({
      ...ephemeralCard(
        makeSuccessCard(
          "Current Prefix",
          `The current prefix for this server is \`${settings.prefix ?? ","}\`.`,
        ),
      ),
    });
  }

  public async chatInputSet(interaction: ChatInputCommandInteraction) {
    await this.checkPermission(interaction, PermissionLevel.ADMIN);
    const guildId = interaction.guildId!;
    const newPrefix = interaction.options.getString("new_prefix", true);

    if (newPrefix.length > 5) {
      return interaction.reply({
        ...ephemeralCard(
          makeErrorCard(
            "Invalid Prefix",
            "Prefix must be 5 characters or less.",
          ),
        ),
      });
    }

    await this.guildSettingsService.setPrefix(guildId, newPrefix);
    this.container.logger.debug(
      `[Prefix] ${Emojis.GEAR} Guild ${guildId} prefix changed to '${newPrefix}' by ${interaction.user.tag}`,
    );
    return interaction.reply({
      ...ephemeralCard(
        makeSuccessCard(
          `${Emojis.GEAR} Prefix Updated`,
          `The prefix for this server has been set to \`${newPrefix}\`.`,
        ),
      ),
    });
  }

  public async chatInputReset(interaction: ChatInputCommandInteraction) {
    await this.checkPermission(interaction, PermissionLevel.ADMIN);
    const guildId = interaction.guildId!;

    await this.guildSettingsService.resetPrefix(guildId);
    this.container.logger.debug(
      `[Prefix] ${Emojis.GEAR} Guild ${guildId} prefix reset by ${interaction.user.tag}`,
    );
    return interaction.reply({
      ...ephemeralCard(
        makeSuccessCard(
          `${Emojis.GEAR} Prefix Reset`,
          "The prefix for this server has been reset to the default.",
        ),
      ),
    });
  }
}
