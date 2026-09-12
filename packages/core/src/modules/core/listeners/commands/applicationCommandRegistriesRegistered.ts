import { ApplyOptions } from "@sapphire/decorators";
import {
  Listener,
  Events,
  type ApplicationCommandRegistry,
} from "@sapphire/framework";
import { styleText } from "node:util";
import { mapWithConcurrency } from "#lib/utilities/concurrency.js";

/** Caps simultaneous guild command fetches so the sync pass cannot trip Discord rate limits. */
const GuildSyncConcurrency = 10;

const Tag = styleText("gray", "[CommandSync]");

@ApplyOptions<Listener.Options>({
  event: Events.ApplicationCommandRegistriesRegistered,
})
export class ApplicationCommandRegistriesRegisteredListener extends Listener {
  public async run(registries: Map<string, ApplicationCommandRegistry>) {
    const { client, logger } = this.container;

    this.container.moduleStore.attachModuleGuards();

    logger.info(
      `${Tag} ${styleText("cyan", "Querying Discord for existing application commands...")}`,
    );

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
          `${Tag} ${styleText("yellow", `Deleting ${redundant.size} redundant global commands: ${redundant.map((c) => c.name).join(", ")}`)}`,
        );
        for (const cmd of redundant.values()) {
          await cmd
            .delete()
            .catch((err) =>
              logger.error(
                `${Tag} Failed to delete global command ${cmd.name}:`,
                err,
              ),
            );
        }
      } else {
        logger.info(`${Tag} ${styleText("green", "Global commands are in sync.")}`);
      }
    }

    let guildCmdCount = 0;
    const guilds = [...client.guilds.cache.values()];

    await mapWithConcurrency(guilds, GuildSyncConcurrency, async (guild) => {
      const guildCommands = await guild.commands.fetch().catch(() => null);
      if (!guildCommands || guildCommands.size === 0) return;

      for (const cmd of guildCommands.values()) {
        const registry = registries.get(cmd.name) as
          | { apiCalls?: { registerOptions: { guildIds?: string[] } }[] }
          | undefined;
        const apiCalls = registry?.apiCalls ?? [];
        const isExpected = apiCalls.some((call) =>
          call.registerOptions.guildIds?.includes(guild.id),
        );

        if (!isExpected) {
          await cmd
            .delete()
            .catch((err: unknown) =>
              logger.warn(
                `${Tag} Failed to delete guild command ${cmd.name} in ${guild.id}:`,
                err,
              ),
            );
          guildCmdCount++;
        }
      }
    });

    if (guildCmdCount > 0) {
      logger.info(
        `${Tag} ${styleText("yellow", `Cleaned up ${guildCmdCount} redundant guild-specific commands.`)}`,
      );
    }
  }
}
