import type { Logger } from "@lumi/foundation";
import type { ModuleLoader } from "@lumi/module-runtime";
import type { Client, Guild } from "discord.js";
import { type CommandRegistry, commandPayloadForGuild } from "./modules.js";


const GuildBatchSize = 10;

export interface CommandSyncOptions {
  client: Client;
  registry: CommandRegistry;
  moduleLoader: Pick<ModuleLoader, "isActive">;
  logger: Logger;
}

export interface CommandSync {
  registerGuild(guild: Guild): Promise<void>;
  syncGuild(guildId: string): Promise<void>;
  syncAll(): Promise<void>;
}

export function createCommandSync(options: CommandSyncOptions): CommandSync {
  const { client, registry, moduleLoader, logger } = options;

  async function registerGuild(guild: Guild): Promise<void> {
    const payload = commandPayloadForGuild(registry, moduleLoader, guild.id);
    try {
      await guild.commands.set(payload);
      logger.info("Registered commands in guild", {
        guildId: guild.id,
        commands: payload.length,
      });
    } catch (error) {
      logger.error("Failed to register commands", { guildId: guild.id, error });
    }
  }

  async function syncGuild(guildId: string): Promise<void> {
    const guild = client.guilds.cache.get(guildId);
    if (guild) await registerGuild(guild);
  }

  async function syncAll(): Promise<void> {
    const guildIds = Array.from(client.guilds.cache.keys());
    for (let index = 0; index < guildIds.length; index += GuildBatchSize) {
      await Promise.all(
        guildIds
          .slice(index, index + GuildBatchSize)
          .map((guildId) => syncGuild(guildId)),
      );
    }
  }

  return { registerGuild, syncGuild, syncAll };
}
