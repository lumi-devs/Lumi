import { ApplyOptions } from "@sapphire/decorators";
import { ApplicationCommandRegistry } from "@sapphire/framework";
import {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "@discordjs/builders";
import {
  type AutocompleteInteraction,
  MessageFlags,
  ApplicationIntegrationType,
} from "discord.js";
import { EmberSubcommand } from "#lib/commands.js";
import { PermissionLevel } from "#lib/permissions.js";
import {
  ephemeralCard,
  makeFieldsCard,
  makeInfoCard,
} from "#utilities/cards.js";
import { type ModuleRecord } from "#core/module-system/ModuleStore.js";
import { FieldType, type ModuleMeta } from "#core/module-system/Module.js";
import { Subcommand } from "@sapphire/plugin-subcommands";
import { EmberEmojis } from "#utilities/assets.js";

@ApplyOptions<EmberSubcommand.Options>({
  name: "config",
  description: "Manage bot configuration for this server",
  preconditions: ["GuildOnly"],
  permissionLevel: PermissionLevel.ADMIN,
  subcommands: [
    { name: "list", chatInputRun: "chatInputList" },
    { name: "get", chatInputRun: "chatInputGet" },
    { name: "set", chatInputRun: "chatInputSet" },
    { name: "enable", chatInputRun: "chatInputEnable" },
    { name: "disable", chatInputRun: "chatInputDisable" },
    { name: "global-enable", chatInputRun: "chatInputGlobalEnable" },
    { name: "global-disable", chatInputRun: "chatInputGlobalDisable" },
  ],
})
export class ConfigCommand extends EmberSubcommand {
  public override registerApplicationCommands(
    registry: ApplicationCommandRegistry,
  ) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName("config")
        .setDescription("Manage bot configuration for this server")
        .setDefaultMemberPermissions(this.defaultMemberPermissions ?? null)
        .setContexts(...this.contexts)
        .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
        .addSubcommand((sub) =>
          sub
            .setName("list")
            .setDescription("List all modules or config fields for a module")
            .addStringOption((opt) =>
              opt
                .setName("module")
                .setDescription("Module name to inspect")
                .setAutocomplete(true),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("get")
            .setDescription("Get the current value of a config field")
            .addStringOption((opt) =>
              opt
                .setName("module")
                .setDescription("Module name")
                .setRequired(true)
                .setAutocomplete(true),
            )
            .addStringOption((opt) =>
              opt.setName("key").setDescription("Config key").setRequired(true),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("set")
            .setDescription("Set a config field value")
            .addStringOption((opt) =>
              opt
                .setName("module")
                .setDescription("Module name")
                .setRequired(true)
                .setAutocomplete(true),
            )
            .addStringOption((opt) =>
              opt.setName("key").setDescription("Config key").setRequired(true),
            )
            .addStringOption((opt) =>
              opt
                .setName("value")
                .setDescription("New value (ID, mention, or text)")
                .setRequired(true),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("enable")
            .setDescription("Enable a module for this server")
            .addStringOption((opt) =>
              opt
                .setName("module")
                .setDescription("Module name")
                .setRequired(true)
                .setAutocomplete(true),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("disable")
            .setDescription("Disable a module for this server")
            .addStringOption((opt) =>
              opt
                .setName("module")
                .setDescription("Module name")
                .setRequired(true)
                .setAutocomplete(true),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("global-enable")
            .setDescription("Globally enable a module (Bot Owner only)")
            .addStringOption((opt) =>
              opt
                .setName("module")
                .setDescription("Module name")
                .setRequired(true)
                .setAutocomplete(true),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("global-disable")
            .setDescription("Globally disable a module (Bot Owner only)")
            .addStringOption((opt) =>
              opt
                .setName("module")
                .setDescription("Module name")
                .setRequired(true)
                .setAutocomplete(true),
            ),
        ),
    );
  }

  public override async autocompleteRun(interaction: AutocompleteInteraction) {
    const focused = (
      interaction.options.getFocused().value as string
    ).toLowerCase();
    const subcommand = interaction.options.getSubcommand();

    let records = this.container.moduleStore.all();

    if (subcommand === "enable" || subcommand === "disable") {
      const onlyEnabled = subcommand === "disable";
      const guildStates = await this.container.db.getGuildModuleStates(
        interaction.guild!.id,
      );
      records = records.filter((r: ModuleRecord) => {
        const isEnabled = guildStates.get(r.meta.name) ?? true;
        return onlyEnabled ? isEnabled : !isEnabled;
      });
    } else if (
      subcommand === "global-enable" ||
      subcommand === "global-disable"
    ) {
      const onlyEnabled = subcommand === "global-disable";
      records = records.filter((r: ModuleRecord) => {
        if (r.meta.isCore) return false;
        return onlyEnabled ? r.enabled : !r.enabled;
      });
    }

    const choices = records
      .filter(
        (r: ModuleRecord) =>
          r.meta.name.toLowerCase().includes(focused) ||
          r.meta.displayName.toLowerCase().includes(focused),
      )
      .slice(0, 25)
      .map((r: ModuleRecord) => ({
        name: `${r.meta.emoji} ${r.meta.displayName}`,
        value: r.meta.name,
      }));
    return interaction.respond(choices);
  }

  public async chatInputList(
    interaction: Subcommand.ChatInputCommandInteraction,
  ) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const guildId = interaction.guild!.id;
    const moduleName = interaction.options.getString("module");

    if (!moduleName) return this.#listAllModules(interaction, guildId);

    const record = this.container.moduleStore.getRecord(moduleName);
    if (!record)
      return this.replyError(
        interaction,
        "Unknown Module",
        `No module named \`${moduleName}\`.`,
        { ephemeral: true },
      );

    return this.#listModuleFields(interaction, guildId, record.meta);
  }

  public async chatInputGet(
    interaction: Subcommand.ChatInputCommandInteraction,
  ) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const guildId = interaction.guild!.id;
    const moduleName = interaction.options.getString("module", true);
    const key = interaction.options.getString("key", true);

    const meta = this.container.moduleStore.getRecord(moduleName)?.meta;
    if (!meta)
      return this.replyError(
        interaction,
        "Unknown Module",
        `No module named \`${moduleName}\`.`,
        { ephemeral: true },
      );

    const field = meta.configFields?.find(
      (f: import("#core/module-system/Module.js").ConfigField) => f.key === key,
    );
    if (!field)
      return this.replyError(
        interaction,
        "Unknown Key",
        `\`${key}\` is not a valid field for **${meta.displayName}**.`,
        { ephemeral: true },
      );

    const value = await this.container.db.getModuleConfig(
      guildId,
      moduleName,
      key,
    );
    const display = value ?? field.default ?? "*not set*";

    return this.replyInfo(
      interaction,
      `${meta.emoji} ${meta.displayName} › \`${key}\``,
      `**${field.label}**: ${display}`,
      { ephemeral: true },
    );
  }

  private get configService(): import("#core/services/ConfigService.js").ConfigService {
    return this.container.stores
      .get("services")
      .get("config") as import("#core/services/ConfigService.js").ConfigService;
  }

  public async chatInputSet(
    interaction: Subcommand.ChatInputCommandInteraction,
  ) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const guildId = interaction.guild!.id;
    const moduleName = interaction.options.getString("module", true);
    const key = interaction.options.getString("key", true);
    const rawValue = interaction.options.getString("value", true);

    const meta = this.container.moduleStore.getRecord(moduleName)?.meta;
    if (!meta)
      return this.replyError(
        interaction,
        "Unknown Module",
        `No module named \`${moduleName}\`.`,
        { ephemeral: true },
      );

    const field = meta.configFields?.find(
      (f: import("#core/module-system/Module.js").ConfigField) => f.key === key,
    );
    if (!field)
      return this.replyError(
        interaction,
        "Unknown Key",
        `\`${key}\` is not a valid field for **${meta.displayName}**.`,
        { ephemeral: true },
      );

    if (field.type === FieldType.BOOLEAN) {
      const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`cfg:bool:${moduleName}:${key}:${guildId}`)
          .setPlaceholder("Choose a value…")
          .addOptions(
            new StringSelectMenuOptionBuilder()
              .setLabel(`${EmberEmojis.CHECK} Enable`)
              .setValue("true")
              .setEmoji({ name: EmberEmojis.CHECK }),
            new StringSelectMenuOptionBuilder()
              .setLabel(`${EmberEmojis.CROSS} Disable`)
              .setValue("false")
              .setEmoji({ name: EmberEmojis.CROSS }),
          ),
      );
      return this.reply(
        interaction,
        ephemeralCard(
          makeInfoCard(
            `${EmberEmojis.GEAR} Select Value`,
            `Setting **${field.label}** for **${meta.displayName}**`,
            { actionRows: [row] },
          ),
        ),
      );
    }

    try {
      const { coerced } = await this.configService.setConfig(
        guildId,
        moduleName,
        key,
        rawValue,
      );
      this.container.logger.debug(
        `[Config] ${EmberEmojis.GEAR} ${interaction.user.tag} set ${moduleName}:${key}=${coerced} in guild ${guildId}`,
      );
      return this.replySuccess(
        interaction,
        "Config Updated",
        `**${field.label}** set to \`${coerced}\`.`,
        { ephemeral: true },
      );
    } catch (err: unknown) {
      const error = err as Error;
      return this.replyError(interaction, "Invalid Value", error.message, {
        ephemeral: true,
      });
    }
  }

  public async chatInputEnable(
    interaction: Subcommand.ChatInputCommandInteraction,
  ) {
    return this.#toggle(interaction, true);
  }

  public async chatInputDisable(
    interaction: Subcommand.ChatInputCommandInteraction,
  ) {
    return this.#toggle(interaction, false);
  }

  public async chatInputGlobalEnable(
    interaction: Subcommand.ChatInputCommandInteraction,
  ) {
    return this.#globalToggle(interaction, true);
  }

  public async chatInputGlobalDisable(
    interaction: Subcommand.ChatInputCommandInteraction,
  ) {
    return this.#globalToggle(interaction, false);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  async #listAllModules(
    interaction: Subcommand.ChatInputCommandInteraction,
    guildId: string,
  ) {
    const modules = this.container.moduleStore.all().map((r) => r.meta);
    const fields = await Promise.all(
      modules.map(async (m: ModuleMeta) => ({
        name: `${m.emoji} ${m.displayName}`,
        value: `${(await this.container.db.isModuleGuildEnabled(guildId, m.name)) ? `${EmberEmojis.CHECK} Enabled` : `${EmberEmojis.CROSS} Disabled`}\n\`/config list module:${m.name}\``,
      })),
    );

    return this.reply(
      interaction,
      ephemeralCard(
        makeFieldsCard(`${EmberEmojis.GEAR} Server Modules`, fields),
      ),
    );
  }

  async #listModuleFields(
    interaction: Subcommand.ChatInputCommandInteraction,
    guildId: string,
    meta: ModuleMeta,
  ) {
    const fields = meta.configFields ?? [];
    if (fields.length === 0) {
      return this.replyInfo(
        interaction,
        `${meta.emoji} ${meta.displayName}`,
        "No configurable fields.",
        { ephemeral: true },
      );
    }

    const uiFields = await Promise.all(
      fields.map(
        async (f: import("#core/module-system/Module.js").ConfigField) => {
          const value = await this.container.db.getModuleConfig(
            guildId,
            meta.name,
            f.key,
          );
          return {
            name: f.label,
            value: `\`${f.key}\`: ${value ?? f.default ?? "*not set*"}\n*Type: ${f.type}*`,
          };
        },
      ),
    );

    return this.reply(
      interaction,
      ephemeralCard(
        makeFieldsCard(`${meta.emoji} ${meta.displayName} Config`, uiFields),
      ),
    );
  }

  async #globalToggle(
    interaction: Subcommand.ChatInputCommandInteraction,
    enable: boolean,
  ) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const name = interaction.options.getString("module", true);

    try {
      const record = await this.configService.toggleGlobalModule(name, enable);
      this.container.logger.debug(
        `[Config] ${enable ? EmberEmojis.CHECK : EmberEmojis.CROSS} Global toggle: ${name} → ${enable ? "ENABLED" : "DISABLED"} by ${interaction.user.tag}`,
      );
      return this.replySuccess(
        interaction,
        `${EmberEmojis.GEAR} Global Sync`,
        `**${record.meta.displayName}** is now globally ${enable ? "enabled" : "disabled"}.`,
        { ephemeral: true },
      );
    } catch (err: unknown) {
      const error = err as Error;
      return this.replyError(interaction, "Config Error", error.message, {
        ephemeral: true,
      });
    }
  }

  async #toggle(
    interaction: Subcommand.ChatInputCommandInteraction,
    enable: boolean,
  ) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const guildId = interaction.guild!.id;
    const name = interaction.options.getString("module", true);

    try {
      const { changed, record } = await this.configService.toggleGuildModule(
        guildId,
        name,
        enable,
      );
      const label = changed ? "has been" : "is already";
      this.container.logger.debug(
        `[Config] ${enable ? EmberEmojis.CHECK : EmberEmojis.CROSS} Guild toggle: ${name} → ${enable ? "ENABLED" : "DISABLED"} in ${guildId} by ${interaction.user.tag}`,
      );
      return this.replySuccess(
        interaction,
        `${EmberEmojis.GEAR} Server Config`,
        `**${record.meta.displayName}** ${label} ${enable ? "enabled" : "disabled"} here.`,
        { ephemeral: true },
      );
    } catch (err: unknown) {
      const error = err as Error;
      return this.replyError(interaction, "Config Error", error.message, {
        ephemeral: true,
      });
    }
  }
}
