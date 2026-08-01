import type { ApplicationCommandRegistry } from "@sapphire/framework";

/**
 * Registers `/module` and its nine subcommands.
 *
 * @param registry - The registry handed to the command piece.
 * @param name - The piece's own name, so the slash command never drifts from
 * the prefix command.
 * @param description - The piece's own description.
 */
export function registerModuleCommand(
  registry: ApplicationCommandRegistry,
  name: string,
  description: string,
): void {
  registry.registerChatInputCommand((b) =>
    b
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
              .setRequired(true),
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
              .setRequired(true),
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
              .setRequired(true),
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
              .setRequired(true),
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
              .setRequired(true),
          )
          .addStringOption((o) =>
            o
              .setName("module")
              .setDescription("The module name")
              .setRequired(true),
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
              .setRequired(true),
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
              .setRequired(false),
          ),
      )
      .addSubcommand((s) =>
        s
          .setName("help")
          .setDescription("Show help message for module command"),
      ),
  );
}
