import { ApplyOptions } from "@sapphire/decorators";
import { UserError } from "@sapphire/framework";
import { Command } from "@sapphire/framework";
import type {
  ChatInputCommandInteraction,
  AutocompleteInteraction,
} from "discord.js";
import { EmberSubcommand } from "#lib/commands.js";
import { PermissionLevel } from "#lib/permissions.js";
import {
  makeFieldsCard,
  makeInfoCard,
  makeSuccessCard,
  makeErrorCard,
} from "#utilities/cards.js";
import { FieldType, type ModuleMeta } from "#core/module-system/Module.js";
import { EmberEmojis } from "#utilities/assets.js";

@ApplyOptions<EmberSubcommand.Options>({
  name: "config",
  description: "Manage bot configuration for this server",
  preconditions: ["GuildOnly"],
  permissionLevel: PermissionLevel.ADMIN,
  subcommands: [
    { name: "list", chatInputRun: "chatInputRunList" },
    { name: "get", chatInputRun: "chatInputRunGet" },
    { name: "set", chatInputRun: "chatInputRunSet" },
    { name: "enable", chatInputRun: "chatInputRunEnable" },
    { name: "disable", chatInputRun: "chatInputRunDisable" },
    { name: "global-enable", chatInputRun: "chatInputRunGlobalEnable" },
    { name: "global-disable", chatInputRun: "chatInputRunGlobalDisable" },
  ],
})
export class ConfigCommand extends EmberSubcommand {
  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName(this.name)
        .setDescription(this.description)
        .addSubcommand((command: any) =>
          command
            .setName("list")
            .setDescription("List all modules or module configuration.")
            .addStringOption((opt: any) =>
              opt
                .setName("module")
                .setDescription("The module to list configuration for")
                .setRequired(false)
                .setAutocomplete(true),
            ),
        )
        .addSubcommand((command: any) =>
          command
            .setName("get")
            .setDescription("Get a configuration value.")
            .addStringOption((opt: any) =>
              opt
                .setName("module")
                .setDescription("The module name")
                .setRequired(true)
                .setAutocomplete(true),
            )
            .addStringOption((opt: any) =>
              opt
                .setName("key")
                .setDescription("The configuration key")
                .setRequired(true),
            ),
        )
        .addSubcommand((command: any) =>
          command
            .setName("set")
            .setDescription("Set a configuration value.")
            .addStringOption((opt: any) =>
              opt
                .setName("module")
                .setDescription("The module name")
                .setRequired(true)
                .setAutocomplete(true),
            )
            .addStringOption((opt: any) =>
              opt
                .setName("key")
                .setDescription("The configuration key")
                .setRequired(true),
            )
            .addStringOption((opt: any) =>
              opt
                .setName("value")
                .setDescription("The value to set")
                .setRequired(true),
            ),
        )
        .addSubcommand((command: any) =>
          command
            .setName("enable")
            .setDescription("Enable a module in this server.")
            .addStringOption((opt: any) =>
              opt
                .setName("module")
                .setDescription("The module name")
                .setRequired(true)
                .setAutocomplete(true),
            ),
        )
        .addSubcommand((command: any) =>
          command
            .setName("disable")
            .setDescription("Disable a module in this server.")
            .addStringOption((opt: any) =>
              opt
                .setName("module")
                .setDescription("The module name")
                .setRequired(true)
                .setAutocomplete(true),
            ),
        )
        .addSubcommand((command: any) =>
          command
            .setName("global-enable")
            .setDescription("Globally enable a module.")
            .addStringOption((opt: any) =>
              opt
                .setName("module")
                .setDescription("The module name")
                .setRequired(true)
                .setAutocomplete(true),
            ),
        )
        .addSubcommand((command: any) =>
          command
            .setName("global-disable")
            .setDescription("Globally disable a module.")
            .addStringOption((opt: any) =>
              opt
                .setName("module")
                .setDescription("The module name")
                .setRequired(true)
                .setAutocomplete(true),
            ),
        ),
    );
  }

  public override async autocompleteRun(interaction: AutocompleteInteraction) {
    const focusedOption = interaction.options.getFocused(true);
    if (focusedOption.name === "module") {
      const focusedValue = focusedOption.value.toLowerCase();
      const subcommand = interaction.options.getSubcommand();
      const { guildId } = interaction;

      let modules = this.container.moduleStore.all();

      // Show/hide modules in autocomplete dynamically depending on subcommand
      if (guildId) {
        if (subcommand === "enable") {
          // Show only modules that are currently disabled in this guild
          const list = [];
          for (const r of modules) {
            const enabled = await this.container.db.isModuleGuildEnabled(
              guildId,
              r.meta.name,
            );
            if (!enabled) list.push(r);
          }
          modules = list;
        } else if (subcommand === "disable") {
          // Show only modules that are currently enabled in this guild
          const list = [];
          for (const r of modules) {
            const enabled = await this.container.db.isModuleGuildEnabled(
              guildId,
              r.meta.name,
            );
            if (enabled) list.push(r);
          }
          modules = list;
        } else if (subcommand === "global-enable") {
          // Show only modules that are currently globally disabled (excluding core)
          modules = modules.filter((r) => !r.enabled && !r.meta.isCore);
        } else if (subcommand === "global-disable") {
          // Show only modules that are currently globally enabled (excluding core)
          modules = modules.filter((r) => r.enabled && !r.meta.isCore);
        }
      }

      let choices = modules
        .filter(
          (r) =>
            r.meta.name.toLowerCase().includes(focusedValue) ||
            r.meta.displayName.toLowerCase().includes(focusedValue),
        )
        .slice(0, 25)
        .map((r) => ({
          name: `${r.meta.emoji} ${r.meta.displayName}`,
          value: r.meta.name,
        }));

      if (choices.length === 0) {
        choices = [
          {
            name:
              subcommand === "enable"
                ? "❌ All modules are already enabled"
                : subcommand === "disable"
                  ? "❌ No modules are currently enabled"
                  : subcommand === "global-enable"
                    ? "❌ All modules are already globally enabled"
                    : "❌ No modules are currently globally enabled",
            value: "none",
          },
        ];
      }

      await interaction.respond(choices);
    }
  }

  public async chatInputRunList(interaction: ChatInputCommandInteraction) {
    const guildId = interaction.guild!.id;
    const moduleName = interaction.options.getString("module");

    if (!moduleName) return this.#listAllModules(interaction, guildId);

    const record = this.container.moduleStore.getRecord(moduleName);
    if (!record)
      throw new UserError({
        identifier: "UnknownModule",
        message: `No module named \`${moduleName}\`.`,
      });

    return this.#listModuleFields(interaction, guildId, record.meta);
  }

  public async chatInputRunGet(interaction: ChatInputCommandInteraction) {
    const guildId = interaction.guild!.id;
    const moduleName = interaction.options.getString("module", true);
    const key = interaction.options.getString("key", true);

    const meta = this.container.moduleStore.getRecord(moduleName)?.meta;
    if (!meta)
      throw new UserError({
        identifier: "UnknownModule",
        message: `No module named \`${moduleName}\`.`,
      });

    const field = meta.configFields?.find(
      (f: import("#core/module-system/Module.js").ConfigField) => f.key === key,
    );
    if (!field)
      throw new UserError({
        identifier: "UnknownKey",
        message: `\`${key}\` is not a valid field for **${meta.displayName}**.`,
      });

    const value = await this.container.db.getModuleConfig(
      guildId,
      moduleName,
      key,
    );
    const display = value ?? field.default ?? "*not set*";

    return interaction.reply(
      makeInfoCard(
        `${meta.emoji} ${meta.displayName} › \`${key}\``,
        `**${field.label}**: ${display}`,
      ),
    );
  }

  private get configService(): import("#core/services/ConfigService.js").ConfigService {
    return this.container.stores
      .get("services")
      .get("config") as import("#core/services/ConfigService.js").ConfigService;
  }

  public async chatInputRunSet(interaction: ChatInputCommandInteraction) {
    const guildId = interaction.guild!.id;
    const moduleName = interaction.options.getString("module", true);
    const key = interaction.options.getString("key", true);
    const rawValue = interaction.options.getString("value", true);

    const meta = this.container.moduleStore.getRecord(moduleName)?.meta;
    if (!meta)
      throw new UserError({
        identifier: "UnknownModule",
        message: `No module named \`${moduleName}\`.`,
      });

    const field = meta.configFields?.find(
      (f: import("#core/module-system/Module.js").ConfigField) => f.key === key,
    );
    if (!field)
      throw new UserError({
        identifier: "UnknownKey",
        message: `\`${key}\` is not a valid field for **${meta.displayName}**.`,
      });

    if (
      field.type === FieldType.BOOLEAN &&
      rawValue !== "true" &&
      rawValue !== "false"
    ) {
      return interaction.reply(
        makeErrorCard(
          "Invalid Value",
          "Boolean fields must be set to `true` or `false`.",
        ),
      );
    }

    const { coerced } = await this.configService.setConfig(
      guildId,
      moduleName,
      key,
      rawValue,
    );
    this.container.logger.debug(
      `[Config] ${EmberEmojis.GEAR} ${interaction.user.tag} set ${moduleName}:${key}=${coerced} in guild ${guildId}`,
    );
    return interaction.reply(
      makeSuccessCard(
        "Config Updated",
        `**${field.label}** set to \`${coerced}\`.`,
      ),
    );
  }

  public async chatInputRunEnable(interaction: ChatInputCommandInteraction) {
    return this.#toggle(interaction, true);
  }

  public async chatInputRunDisable(interaction: ChatInputCommandInteraction) {
    return this.#toggle(interaction, false);
  }

  public async chatInputRunGlobalEnable(
    interaction: ChatInputCommandInteraction,
  ) {
    return this.#globalToggle(interaction, true);
  }

  public async chatInputRunGlobalDisable(
    interaction: ChatInputCommandInteraction,
  ) {
    return this.#globalToggle(interaction, false);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  async #listAllModules(
    interaction: ChatInputCommandInteraction,
    guildId: string,
  ) {
    const modules = this.container.moduleStore.all().map((r) => r.meta);
    const fields = await Promise.all(
      modules.map(async (m: ModuleMeta) => ({
        name: `${m.emoji} ${m.displayName}`,
        value: `${(await this.container.db.isModuleGuildEnabled(guildId, m.name)) ? `${EmberEmojis.CHECK} Enabled` : `${EmberEmojis.CROSS} Disabled`}\n\`/config list module:${m.name}\``,
      })),
    );

    return interaction.reply(
      makeFieldsCard(`${EmberEmojis.GEAR} Server Modules`, fields),
    );
  }

  async #listModuleFields(
    interaction: ChatInputCommandInteraction,
    guildId: string,
    meta: ModuleMeta,
  ) {
    const fields = meta.configFields ?? [];
    if (fields.length === 0) {
      return interaction.reply(
        makeInfoCard(
          `${meta.emoji} ${meta.displayName}`,
          "No configurable fields.",
        ),
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

    return interaction.reply(
      makeFieldsCard(`${meta.emoji} ${meta.displayName} Config`, uiFields),
    );
  }

  async #globalToggle(
    interaction: ChatInputCommandInteraction,
    enable: boolean,
  ) {
    const name = interaction.options.getString("module", true);

    if (name === "none") {
      return interaction.reply(
        makeErrorCard(
          "Config Error",
          enable
            ? "All modules are already globally enabled."
            : "No modules are currently globally enabled.",
        ),
      );
    }

    const record = await this.configService.toggleGlobalModule(name, enable);
    this.container.logger.debug(
      `[Config] ${enable ? EmberEmojis.CHECK : EmberEmojis.CROSS} Global toggle: ${name} → ${enable ? "ENABLED" : "DISABLED"} by ${interaction.user.tag}`,
    );
    return interaction.reply(
      makeSuccessCard(
        `${EmberEmojis.GEAR} Global Sync`,
        `**${record.meta.displayName}** is now globally ${enable ? "enabled" : "disabled"}.`,
      ),
    );
  }

  async #toggle(interaction: ChatInputCommandInteraction, enable: boolean) {
    const guildId = interaction.guild!.id;
    const name = interaction.options.getString("module", true);

    if (name === "none") {
      return interaction.reply(
        makeErrorCard(
          "Config Error",
          enable
            ? "All modules are already enabled in this server."
            : "No modules are currently enabled in this server.",
        ),
      );
    }

    const { changed, record } = await this.configService.toggleGuildModule(
      guildId,
      name,
      enable,
    );
    const label = changed ? "has been" : "is already";
    this.container.logger.debug(
      `[Config] ${enable ? EmberEmojis.CHECK : EmberEmojis.CROSS} Guild toggle: ${name} → ${enable ? "ENABLED" : "DISABLED"} in ${guildId} by ${interaction.user.tag}`,
    );
    return interaction.reply(
      makeSuccessCard(
        `${EmberEmojis.GEAR} Server Config`,
        `**${record.meta.displayName}** ${label} ${enable ? "enabled" : "disabled"} here.`,
      ),
    );
  }
}
