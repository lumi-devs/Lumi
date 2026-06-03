import { ApplyOptions } from "@sapphire/decorators";
import {
  Listener,
  Events,
  type ApplicationCommandRegistry,
} from "@sapphire/framework";
import { cyan, gray, yellow, green } from "colorette";

@ApplyOptions<Listener.Options>({
  event: Events.ApplicationCommandRegistriesRegistered,
})
export class ApplicationCommandRegistriesRegisteredListener extends Listener {
  public async run(registries: Map<string, ApplicationCommandRegistry>) {
    const { client, logger } = this.container;

    // Gate every module-owned command behind its module's enable state, even
    // addon commands that never declared the ModuleEnabled precondition.
    this.container.moduleStore.attachModuleGuards();

    logger.info(
      `${gray("[CommandSync]")} ${cyan("Querying Discord for existing application commands...")}`,
    );

    // 1. Sync Global Commands
    const globalCommands = await client.application?.commands.fetch();
    if (globalCommands) {
      const registeredNames = new Set(
        [...registries.values()].map((r) => r.commandName),
      );

      const redundant = globalCommands.filter(
        (cmd) => !registeredNames.has(cmd.name),
      );

      if (redundant.size > 0) {
        logger.warn(
          `${gray("[CommandSync]")} ${yellow(`Deleting ${redundant.size} redundant global commands: ${redundant.map((c) => c.name).join(", ")}`)}`,
        );
        for (const cmd of redundant.values()) {
          await cmd
            .delete()
            .catch((err) =>
              logger.error(
                `${gray("[CommandSync]")} Failed to delete global command ${cmd.name}:`,
                err,
              ),
            );
        }
      } else {
        logger.info(
          `${gray("[CommandSync]")} ${green("Global commands are in sync.")}`,
        );
      }
    }

    // 2. Sync Guild Commands (Cleanup any accidental guild-specific commands)
    let guildCmdCount = 0;
    const guilds = client.guilds.cache;

    for (const guild of guilds.values()) {
      const guildCommands = await guild.commands.fetch().catch(() => null);
      if (!guildCommands || guildCommands.size === 0) continue;

      for (const cmd of guildCommands.values()) {
        // We check if any registry entry explicitly targets this guild
        const registry = registries.get(cmd.name) as
          | { apiCalls?: { registerOptions: { guildIds?: string[] } }[] }
          | undefined;
        const apiCalls = registry?.apiCalls ?? [];
        const isExpected = apiCalls.some((call) =>
          call.registerOptions.guildIds?.includes(guild.id),
        );

        if (!isExpected) {
          await cmd.delete().catch((err: unknown) =>
            logger.warn(
              `${gray("[CommandSync]")} Failed to delete guild command ${cmd.name} in ${guild.id}:`,
              err,
            ),
          );
          guildCmdCount++;
        }
      }
    }

    if (guildCmdCount > 0) {
      logger.info(
        `${gray("[CommandSync]")} ${yellow(`Cleaned up ${guildCmdCount} redundant guild-specific commands.`)}`,
      );
    }
  }
}
