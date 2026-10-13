import { SlashCommandBuilder, type SlashCommandSubcommandBuilder, type SlashCommandSubcommandsOnlyBuilder } from "discord.js";

function moduleOptionSub(
  s: SlashCommandSubcommandBuilder,
  name: string,
  description: string,
  optionDescription: string,
): SlashCommandSubcommandBuilder {
  return s
    .setName(name)
    .setDescription(description)
    .addStringOption((o) =>
      o
        .setName("module")
        .setDescription(optionDescription)
        .setRequired(true)
        .setAutocomplete(true),
    );
}

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
      moduleOptionSub(s, "info", "Get detailed information about a module", "The name of the module"),
    )
    .addSubcommand((s) =>
      moduleOptionSub(s, "enable", "Enable a module globally", "The name of the module to enable"),
    )
    .addSubcommand((s) =>
      moduleOptionSub(s, "disable", "Disable a module globally", "The name of the module to disable"),
    )
    .addSubcommand((s) =>
      moduleOptionSub(s, "reload", "Reload a module's source code dynamically", "The name of the module to reload"),
    )
    .addSubcommand((s) =>
      moduleOptionSub(s, "load", "Load a discovered module for this session", "The name of the module to load"),
    )
    .addSubcommand((s) =>
      moduleOptionSub(s, "unload", "Unload a module for this session", "The name of the module to unload"),
    )
    .addSubcommand((s) =>
      s
        .setName("status")
        .setDescription("List loaded versus available modules"),
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
      moduleOptionSub(s, "uninstall", "Uninstall a third-party module", "The module name to uninstall"),
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
      moduleOptionSub(
        s,
        "pin",
        "Freeze an installed module's version - ,module update will skip it",
        "The module name to pin",
      ),
    )
    .addSubcommand((s) =>
      moduleOptionSub(s, "unpin", "Remove the update lock set by ,module pin", "The module name to unpin"),
    )
    .addSubcommand((s) =>
      s
        .setName("help")
        .setDescription("Show help message for module command"),
    );
}
