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

interface ModuleManifestLike {
  name: string;
  configKey?: string;
  configFields?: readonly {
    key: string;
    type: string;
    default?: unknown;
  }[];
}

function featureEnabled(
  manifest: ModuleManifestLike,
  settings: unknown,
): boolean {
  const field = manifest.configFields?.find(
    (item) => item.key === "enabled" && item.type === "boolean",
  );
  if (!field) return true;
  if (typeof settings !== "object" || settings === null) {
    return field.default === true;
  }
  const key = manifest.configKey ?? manifest.name;
  if (!Object.hasOwn(settings, key)) return field.default === true;
  const raw: unknown = Reflect.get(settings, key);
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return field.default === true;
  }
  const stored: unknown = Object.hasOwn(raw, field.key)
    ? Reflect.get(raw, field.key)
    : undefined;
  const value = stored === undefined ? field.default : stored;
  return value === true;
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

    let settings: unknown = {};
    let settingsKnown = true;
    try {
      const guild = await prisma.guild.findUnique({
        where: { id: guildId },
        select: { settings: true },
      });
      settings = guild?.settings ?? {};
    } catch (error) {
      settingsKnown = false;
      logger.warn("Could not load guild settings for module feature flags", {
        guildId,
        error,
      });
    }

    const state = new Map(
      rows.map((row) => [row.module, row.enabled] as const),
    );
    await Promise.all(
      moduleLoader.listAll().map((module) => {
        const moduleEnabled = state.get(module.manifest.name) ?? true;
        const featureOn =
          !settingsKnown || featureEnabled(module.manifest, settings);
        return moduleLoader.setEnabled(
          module.manifest.name,
          guildId,
          moduleEnabled && featureOn,
        );
      }),
    );
  }

  return { syncRecord, syncModules };
}
