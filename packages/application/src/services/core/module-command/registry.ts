import { SlashCommandBuilder, type SlashCommandSubcommandsOnlyBuilder } from "discord.js";

export function buildModuleCommand(
  name: string,
  description: string,
): SlashCommandSubcommandsOnlyBuilder {
  return new SlashCommandBuilder()
    .setName(name)
    .setDescription(description)
    .addSubcommand((s) =>
      s
        .setName("list")
        .setDescription("List all discovered modules and their status"),
    )
    .addSubcommand((s) =>
      s
        .setName("info")
        .setDescription("Get detailed information about a module")
        .addStringOption((o) =>
          o
            .setName("module")
            .setDescription("The name of the module")
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("enable")
        .setDescription("Enable a module globally")
        .addStringOption((o) =>
          o
            .setName("module")
            .setDescription("The name of the module to enable")
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("disable")
        .setDescription("Disable a module globally")
        .addStringOption((o) =>
          o
            .setName("module")
            .setDescription("The name of the module to disable")
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("reload")
        .setDescription("Reload a module's source code dynamically")
        .addStringOption((o) =>
          o
            .setName("module")
            .setDescription("The name of the module to reload")
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("install")
        .setDescription("Install a third-party module")
        .addStringOption((o) =>
          o
            .setName("repo")
            .setDescription("The repository name")
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addStringOption((o) =>
          o
            .setName("module")
            .setDescription("The module name")
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("uninstall")
        .setDescription("Uninstall a third-party module")
        .addStringOption((o) =>
          o
            .setName("module")
            .setDescription("The module name to uninstall")
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("update")
        .setDescription("Update an installed module (or all modules)")
        .addStringOption((o) =>
          o
            .setName("module")
            .setDescription("The module name to update (omit to update all)")
            .setRequired(false)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("pin")
        .setDescription(
          "Freeze an installed module's version - ,module update will skip it",
        )
        .addStringOption((o) =>
          o
            .setName("module")
            .setDescription("The module name to pin")
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("unpin")
        .setDescription("Remove the update lock set by ,module pin")
        .addStringOption((o) =>
          o
            .setName("module")
            .setDescription("The module name to unpin")
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("help")
        .setDescription("Show help message for module command"),
    );
}
