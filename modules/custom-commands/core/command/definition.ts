import type { CommandDefinition } from "@lumi/module-kit";
import { ephemeralCard, makeErrorCard } from "@lumi/ui";
import { SlashCommandBuilder } from "discord.js";
import { getCustomCommandsConfig } from "../config.js";
import {
  createCustomCommand,
  deleteCustomCommand,
  diagnoseCommands,
  editCustomCommand,
  errorCard,
  type GroupAction,
  listCustomCommands,
  manageGroup,
  manageSchedule,
  type ScheduleAction,
  showCustomCommand,
} from "../management.js";
import { listCommands, listGroups } from "../store.js";
import { Limits, ModuleName, TriggerTypes } from "../types.js";
import { handleKv } from "./kv.js";
import {
  exportCommands,
  importFromInteraction,
  runCustomCommand,
} from "./operations.js";
import { requireManage } from "./shared.js";

export const customCommandCommand: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("customcommand")
    .setDescription("Create, manage and run custom commands")
    .addSubcommand((sub) =>
      sub
        .setName("run")
        .setDescription("Run a custom command")
        .addStringOption((option) =>
          option
            .setName("name")
            .setDescription("Command name")
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addStringOption((option) =>
          option.setName("args").setDescription("Arguments").setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("create")
        .setDescription("Create a custom command")
        .addStringOption((option) =>
          option
            .setName("name")
            .setDescription("Command name")
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("trigger_type")
            .setDescription("How the command is triggered")
            .setRequired(true)
            .addChoices(
              ...TriggerTypes.map((type) => ({ name: type, value: type })),
            ),
        )
        .addStringOption((option) =>
          option
            .setName("trigger")
            .setDescription("Trigger value or pattern")
            .setRequired(false),
        )
        .addStringOption((option) =>
          option
            .setName("response")
            .setDescription("Response text or JSON array")
            .setMaxLength(4_000)
            .setRequired(false),
        )
        .addStringOption((option) =>
          option
            .setName("description")
            .setDescription("Description")
            .setMaxLength(200),
        )
        .addStringOption((option) =>
          option
            .setName("group")
            .setDescription("Group name")
            .setAutocomplete(true)
            .setRequired(false),
        )
        .addIntegerOption((option) =>
          option
            .setName("cooldown")
            .setDescription("Cooldown in seconds")
            .setMinValue(0)
            .setMaxValue(Limits.cooldownMaxSeconds)
            .setRequired(false),
        )
        .addStringOption((option) =>
          option
            .setName("permissions")
            .setDescription("Comma-separated permit nodes (any grants access)")
            .setRequired(false),
        )
        .addBooleanOption((option) =>
          option.setName("enabled").setDescription("Enable immediately"),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("edit")
        .setDescription("Edit a custom command")
        .addStringOption((option) =>
          option
            .setName("name")
            .setDescription("Command name")
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addStringOption((option) =>
          option
            .setName("trigger_type")
            .setDescription("New trigger type")
            .addChoices(
              ...TriggerTypes.map((type) => ({ name: type, value: type })),
            ),
        )
        .addStringOption((option) =>
          option.setName("trigger").setDescription("New trigger value"),
        )
        .addStringOption((option) =>
          option
            .setName("response")
            .setDescription("New response text or JSON array")
            .setMaxLength(4_000),
        )
        .addStringOption((option) =>
          option
            .setName("description")
            .setDescription("New description")
            .setMaxLength(200),
        )
        .addStringOption((option) =>
          option
            .setName("group")
            .setDescription("New group, or 'none' to clear")
            .setAutocomplete(true),
        )
        .addIntegerOption((option) =>
          option
            .setName("cooldown")
            .setDescription("Cooldown in seconds")
            .setMinValue(0)
            .setMaxValue(Limits.cooldownMaxSeconds),
        )
        .addStringOption((option) =>
          option
            .setName("permissions")
            .setDescription("Comma-separated permit nodes"),
        )
        .addBooleanOption((option) =>
          option.setName("enabled").setDescription("Enable or disable"),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("delete")
        .setDescription("Delete a custom command")
        .addStringOption((option) =>
          option
            .setName("name")
            .setDescription("Command name")
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("list")
        .setDescription("List custom commands")
        .addIntegerOption((option) =>
          option.setName("page").setDescription("Page number").setMinValue(1),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("show")
        .setDescription("Show a custom command")
        .addStringOption((option) =>
          option
            .setName("name")
            .setDescription("Command name")
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("export")
        .setDescription("Export custom commands as JSON")
        .addStringOption((option) =>
          option
            .setName("name")
            .setDescription("Export one command instead of everything")
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("import")
        .setDescription("Import custom commands from JSON")
        .addStringOption((option) =>
          option
            .setName("data")
            .setDescription("Inline JSON")
            .setMaxLength(6_000)
            .setRequired(false),
        )
        .addAttachmentOption((option) =>
          option.setName("file").setDescription("JSON file").setRequired(false),
        )
        .addBooleanOption((option) =>
          option
            .setName("overwrite")
            .setDescription("Replace commands that already exist"),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("group")
        .setDescription("Manage command groups")
        .addStringOption((option) =>
          option
            .setName("action")
            .setDescription("Group action")
            .setRequired(true)
            .addChoices(
              { name: "create", value: "create" },
              { name: "delete", value: "delete" },
              { name: "rename", value: "rename" },
              { name: "list", value: "list" },
            ),
        )
        .addStringOption((option) =>
          option
            .setName("name")
            .setDescription("Group name")
            .setAutocomplete(true)
            .setRequired(false),
        )
        .addStringOption((option) =>
          option.setName("new_name").setDescription("New group name"),
        )
        .addStringOption((option) =>
          option
            .setName("description")
            .setDescription("Group description")
            .setMaxLength(200),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("schedule")
        .setDescription("Manage command schedules")
        .addStringOption((option) =>
          option
            .setName("action")
            .setDescription("Schedule action")
            .setRequired(true)
            .addChoices(
              { name: "set", value: "set" },
              { name: "clear", value: "clear" },
              { name: "list", value: "list" },
            ),
        )
        .addStringOption((option) =>
          option
            .setName("name")
            .setDescription("Command name")
            .setAutocomplete(true)
            .setRequired(false),
        )
        .addStringOption((option) =>
          option.setName("cron").setDescription("Five-field cron expression"),
        )
        .addStringOption((option) =>
          option
            .setName("interval")
            .setDescription("Interval such as 30s, 5m, 2h"),
        )
        .addStringOption((option) =>
          option
            .setName("timezone")
            .setDescription("IANA timezone (default UTC)"),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("kv")
        .setDescription("Manage your command KV data")
        .addStringOption((option) =>
          option
            .setName("action")
            .setDescription("KV action")
            .setRequired(true)
            .addChoices(
              { name: "get", value: "get" },
              { name: "set", value: "set" },
              { name: "incr", value: "incr" },
              { name: "del", value: "del" },
              { name: "list", value: "list" },
            ),
        )
        .addStringOption((option) =>
          option.setName("key").setDescription("KV key").setRequired(false),
        )
        .addStringOption((option) =>
          option.setName("value").setDescription("JSON or plain value"),
        )
        .addIntegerOption((option) =>
          option
            .setName("ttl")
            .setDescription("Expiry in seconds")
            .setMinValue(1)
            .setMaxValue(Limits.kvTtlMaxSeconds),
        )
        .addIntegerOption((option) =>
          option.setName("by").setDescription("Increment amount (default 1)"),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("diagnose")
        .setDescription("Check command triggers, templates and schedules")
        .addStringOption((option) =>
          option
            .setName("name")
            .setDescription("Check one command")
            .setAutocomplete(true),
        ),
    ),
  aliases: ["cc"],
  async autocomplete(interaction, services) {
    if (!interaction.guildId) {
      await interaction.respond([]);
      return;
    }
    const focused = interaction.options.getFocused(true);
    const subcommand = interaction.options.getSubcommand(false);

    const nameOptions = new Set(["name", "new_name"]);
    if (!nameOptions.has(focused.name)) {
      await interaction.respond([]);
      return;
    }

    if (subcommand === "group") {
      const groups = await listGroups(services, interaction.guildId);
      const query = String(focused.value ?? "").toLowerCase();
      await interaction.respond(
        groups
          .filter((group) => group.name.includes(query))
          .slice(0, 25)
          .map((group) => ({ name: group.name, value: group.name })),
      );
      return;
    }

    if (focused.name === "new_name") {
      await interaction.respond([]);
      return;
    }

    const commands = await listCommands(services, interaction.guildId);
    const query = String(focused.value ?? "").toLowerCase();
    await interaction.respond(
      commands
        .filter((command) => command.name.includes(query))
        .slice(0, 25)
        .map((command) => ({ name: command.name, value: command.name })),
    );
  },
  async execute(interaction, services) {
    if (!interaction.guildId || !interaction.guild) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Server Only",
            "Custom commands only run inside a server.",
          ),
        ),
      );
      return;
    }

    const guild = interaction.guild;
    const guildId = interaction.guildId;
    if (!services.modules.isEnabled(guildId, ModuleName)) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Module Disabled",
            "The custom-commands module is disabled on this server.",
          ),
        ),
      );
      return;
    }

    const config = await getCustomCommandsConfig(services, guildId);
    if (!config.enabled) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Custom Commands Disabled",
            "Custom commands are disabled in this module's settings.",
          ),
        ),
      );
      return;
    }

    const subcommand = interaction.options.getSubcommand(true);

    try {
      if (subcommand === "run") {
        await runCustomCommand(interaction, services, guild);
        return;
      }

      if (!(await requireManage(interaction, services, guild))) return;

      switch (subcommand) {
        case "create":
          await interaction.reply(
            await createCustomCommand(services, guildId, interaction.user.id, {
              name: interaction.options.getString("name", true),
              triggerType: interaction.options.getString("trigger_type", true),
              trigger: interaction.options.getString("trigger"),
              response: interaction.options.getString("response"),
              description: interaction.options.getString("description"),
              group: interaction.options.getString("group"),
              cooldown: interaction.options.getInteger("cooldown"),
              permissions: interaction.options.getString("permissions"),
              enabled: interaction.options.getBoolean("enabled"),
            }),
          );
          return;
        case "edit":
          await interaction.reply(
            await editCustomCommand(services, guildId, {
              name: interaction.options.getString("name", true),
              triggerType: interaction.options.getString("trigger_type"),
              trigger: interaction.options.getString("trigger"),
              response: interaction.options.getString("response"),
              description: interaction.options.getString("description"),
              group: interaction.options.getString("group"),
              cooldown: interaction.options.getInteger("cooldown"),
              permissions: interaction.options.getString("permissions"),
              enabled: interaction.options.getBoolean("enabled"),
            }),
          );
          return;
        case "delete":
          await interaction.reply(
            await deleteCustomCommand(
              services,
              guildId,
              interaction.options.getString("name", true),
            ),
          );
          return;
        case "list":
          await interaction.reply(
            await listCustomCommands(
              services,
              guildId,
              interaction.options.getInteger("page") ?? 1,
            ),
          );
          return;
        case "show":
          await interaction.reply(
            await showCustomCommand(
              services,
              guildId,
              interaction.options.getString("name", true),
            ),
          );
          return;
        case "export":
          await exportCommands(interaction, services, guild);
          return;
        case "import":
          await importFromInteraction(interaction, services, guild);
          return;
        case "group":
          await interaction.reply(
            await manageGroup(
              services,
              guildId,
              interaction.options.getString("action", true) as GroupAction,
              interaction.options.getString("name"),
              interaction.options.getString("new_name"),
              interaction.options.getString("description"),
            ),
          );
          return;
        case "schedule":
          await interaction.reply(
            await manageSchedule(
              services,
              guildId,
              interaction.options.getString("action", true) as ScheduleAction,
              interaction.options.getString("name"),
              interaction.options.getString("cron"),
              interaction.options.getString("interval"),
              interaction.options.getString("timezone"),
            ),
          );
          return;
        case "kv":
          await handleKv(interaction, services, guild);
          return;
        case "diagnose":
          await interaction.reply(
            await diagnoseCommands(
              services,
              guildId,
              interaction.options.getString("name"),
            ),
          );
          return;
        default:
          throw new Error(`Unknown subcommand "${subcommand}".`);
      }
    } catch (error) {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorCard(error)).catch(() => undefined);
        return;
      }
      await interaction.reply(errorCard(error)).catch(() => undefined);
    }
  },
};
