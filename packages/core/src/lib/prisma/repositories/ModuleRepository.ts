import { RedisKeys, RedisTTL } from "#lib/database/redis.js";
import { container } from "@sapphire/framework";
import { tryParseJSON } from "@sapphire/utilities";
import { Repository } from "#lib/prisma/repositories/Repository.js";

/** Repository for global and guild-specific module enabled states. */
export class ModuleRepository extends Repository {
  #isEssential(name: string): boolean {
    return Boolean(container.moduleStore && !container.moduleStore.isModuleDisableable(name));
  }

  public isModuleGlobalEnabled(name: string): Promise<boolean> {
    if (this.#isEssential(name)) {
      return Promise.resolve(true);
    }
    return this.getOrSet(
      RedisKeys.moduleGlobalEnabled(name),
      RedisTTL.moduleEnabledCache,
      async () => {
        const state = await this.prisma.globalModuleState.findUnique({
          where: { moduleName: name },
        });
        return state?.enabled ?? true;
      },
    );
  }

  public async setModuleGlobalEnabled(
    name: string,
    enabled: boolean,
    reason?: string | null,
  ) {
    if (!enabled && this.#isEssential(name)) {
      throw new Error(`Module '${name}' is essential and cannot be disabled.`);
    }
    await this.prisma.globalModuleState.upsert({
      where: { moduleName: name },
      update: { enabled, reason: reason ?? null },
      create: { moduleName: name, enabled, reason: reason ?? null },
    });
    await this.invalidate(RedisKeys.moduleGlobalEnabled(name));
  }

  public async getGlobalModuleStates(): Promise<Map<string, boolean>> {
    const rows = await this.prisma.globalModuleState.findMany();
    return new Map(rows.map((r) => [r.moduleName, r.enabled]));
  }

  /** Full kill-switch rows (incl. `reason`) for the dashboard's system panel. */
  public async getGlobalModuleStatesDetailed(): Promise<
    { moduleName: string; enabled: boolean; reason: string | null }[]
  > {
    return this.prisma.globalModuleState.findMany({
      select: { moduleName: true, enabled: true, reason: true },
    });
  }

  public async getGuildModuleStates(
    guildId: string,
  ): Promise<Map<string, boolean>> {
    const rows = await this.prisma.guildModuleState.findMany({
      where: { guildId },
    });
    return new Map(rows.map((r) => [r.moduleName, r.enabled]));
  }

  public isModuleGuildEnabled(guildId: string, name: string): Promise<boolean> {
    if (this.#isEssential(name)) {
      return Promise.resolve(true);
    }
    return this.getOrSet(
      RedisKeys.moduleEnabled(name, guildId),
      RedisTTL.moduleEnabledCache,
      async () => {
        const state = await this.prisma.guildModuleState.findUnique({
          where: { guildId_moduleName: { guildId, moduleName: name } },
        });
        return state?.enabled ?? true;
      },
    );
  }

  public async isModuleEnabled(
    guildId: string | null,
    moduleName: string,
  ): Promise<boolean> {
    if (!(await this.isModuleGlobalEnabled(moduleName))) return false;

    if (guildId) {
      if (!(await this.isModuleGuildEnabled(guildId, moduleName))) return false;

      return this.#configLevelEnabled(guildId, moduleName);
    }

    return true;
  }

  /** Batched variant of isModuleEnabled checking multiple modules in one roundtrip. */
  public async areModulesEnabled(
    guildId: string,
    moduleNames: string[],
  ): Promise<Map<string, boolean>> {
    const globalKeys = moduleNames.map((n) => RedisKeys.moduleGlobalEnabled(n));
    const guildKeys = moduleNames.map((n) =>
      RedisKeys.moduleEnabled(n, guildId),
    );

    const raw = await this.redis.mget(...globalKeys, ...guildKeys);
    const half = moduleNames.length;

    const result = new Map<string, boolean>();

    for (let i = 0; i < moduleNames.length; i++) {
      const name = moduleNames[i]!;

      const globalRaw = raw[i] ?? null;
      if (globalRaw === null) {
        const globalEnabled = await this.isModuleGlobalEnabled(name);
        if (!globalEnabled) {
          result.set(name, false);
          continue;
        }
      } else {
        const globalEnabled = tryParseJSON(globalRaw) === true;
        if (!globalEnabled) {
          result.set(name, false);
          continue;
        }
      }

      const guildRaw = raw[half + i] ?? null;
      if (guildRaw === null) {
        const guildEnabled = await this.isModuleGuildEnabled(guildId, name);
        if (!guildEnabled) {
          result.set(name, false);
          continue;
        }
      } else {
        const guildEnabled = tryParseJSON(guildRaw) === true;
        if (!guildEnabled) {
          result.set(name, false);
          continue;
        }
      }

      result.set(name, await this.#configLevelEnabled(guildId, name));
    }

    return result;
  }

  public async setModuleGuildEnabled(
    guildId: string,
    name: string,
    enabled: boolean,
  ) {
    if (!enabled && this.#isEssential(name)) {
      throw new Error(`Module '${name}' is essential and cannot be disabled.`);
    }
    const updated = await this.prisma.guildModuleState.upsert({
      where: { guildId_moduleName: { guildId, moduleName: name } },
      update: { enabled },
      create: { guildId, moduleName: name, enabled },
    });
    await this.invalidate(RedisKeys.moduleEnabled(name, guildId));
    return updated;
  }

  /** Resolves a module's config-level enable state. */
  async #configLevelEnabled(guildId: string, name: string): Promise<boolean> {
    const configEnabled = await this.db.config.getModuleConfig(
      guildId,
      name,
      "enabled",
    );
    if (configEnabled !== null && configEnabled !== undefined) {
      return configEnabled !== false;
    }
    const record = container.moduleStore?.getRecord(name);
    const field = record?.meta.configFields?.find((f) => f.key === "enabled");
    return field ? field.default !== false : true;
  }
}
