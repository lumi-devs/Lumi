import type { PrismaClient } from "@lumi/db";
import type { Logger } from "@lumi/foundation";
import type { ModuleLoader } from "@lumi/module-runtime";
import type { PermitRepository } from "@lumi/permits";
import type { Guild } from "discord.js";

export interface GuildSyncOptions {
  prisma: PrismaClient;
  permits: PermitRepository;
  moduleLoader: ModuleLoader;
  logger: Logger;
}

export interface GuildSync {
  syncRecord(guild: Guild): Promise<void>;
  syncModules(guildId: string): Promise<void>;
}

export function createGuildSync(options: GuildSyncOptions): GuildSync {
  const { prisma, permits, moduleLoader, logger } = options;

  async function syncRecord(guild: Guild): Promise<void> {
    try {
      await prisma.guild.upsert({
        where: { id: guild.id },
        update: {
          name: guild.name,
          icon: guild.iconURL({ size: 128 }),
          ownerId: guild.ownerId,
          leftAt: null,
        },
        create: {
          id: guild.id,
          name: guild.name,
          icon: guild.iconURL({ size: 128 }),
          ownerId: guild.ownerId,
        },
      });
      await permits.seedBuiltinPermits(guild.id);
    } catch (error) {
      logger.warn("Could not sync guild", { guildId: guild.id, error });
    }
  }

  async function syncModules(guildId: string): Promise<void> {
    let rows: Array<{ module: string; enabled: boolean }> = [];
    try {
      rows = await prisma.guildModule.findMany({ where: { guildId } });
    } catch (error) {

      logger.warn("Could not load guild module state, defaulting to enabled", {
        guildId,
        error,
      });
    }
    const state = new Map(rows.map((row) => [row.module, row.enabled] as const));
    await Promise.all(
      moduleLoader.listAll().map((module) =>
        moduleLoader.setEnabled(
          module.manifest.name,
          guildId,
          state.get(module.manifest.name) ?? true,
        ),
      ),
    );
  }

  return { syncRecord, syncModules };
}
