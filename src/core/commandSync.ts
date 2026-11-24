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

export type SyncGuildCommands = (guildId: string) => Promise<void>;

export interface CommandSync {
  registerGuild(guild: Guild): Promise<void>;
  syncGuild: SyncGuildCommands;
  syncAll(): Promise<void>;
}

export function createCommandSync(options: CommandSyncOptions): CommandSync {
  const { client, registry, moduleLoader, logger } = options;
  const pendingSyncs = new Map<string, Promise<void>>();
  const lastSyncTime = new Map<string, number>();
  const MinSyncIntervalMs = 5000;

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
    if (!guild) return;

    const existing = pendingSyncs.get(guildId);
    if (existing) return existing;

    const now = Date.now();
    const last = lastSyncTime.get(guildId) ?? 0;
    if (now - last < MinSyncIntervalMs) {
      const waitMs = MinSyncIntervalMs - (now - last);
      const promise = new Promise<void>((resolve) =>
        setTimeout(resolve, waitMs),
      ).then(async () => {
        pendingSyncs.delete(guildId);
        lastSyncTime.set(guildId, Date.now());
        await registerGuild(guild);
      });
      pendingSyncs.set(guildId, promise);
      return promise;
    }

    lastSyncTime.set(guildId, now);
    const promise = registerGuild(guild).finally(() => {
      pendingSyncs.delete(guildId);
    });
    pendingSyncs.set(guildId, promise);
    return promise;
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
