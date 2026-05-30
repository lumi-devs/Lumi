import { RedisKeys, RedisTTL } from "#database/redis.js";
import { container } from "@sapphire/framework";
import { Repository } from "#root/prisma/repositories/Repository.js";

/**
 * Global + per-guild module enable state (`GlobalModuleState`,
 * `GuildModuleState`).  Reads the config-level `enabled` key through
 * `this.db.config` rather than touching `GuildModuleConfig` directly.
 */
export class ModuleRepository extends Repository {
  public async isModuleGlobalEnabled(name: string): Promise<boolean> {
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

  public async getGuildModuleStates(
    guildId: string,
  ): Promise<Map<string, boolean>> {
    const rows = await this.prisma.guildModuleState.findMany({
      where: { guildId },
    });
    return new Map(rows.map((r) => [r.moduleName, r.enabled]));
  }

  public async isModuleGuildEnabled(
    guildId: string,
    name: string,
  ): Promise<boolean> {
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
    // 1. Global state check
    if (!(await this.isModuleGlobalEnabled(moduleName))) return false;

    // 2. Guild-specific checks
    if (guildId) {
      // General guild toggle (/config enable/disable)
      if (!(await this.isModuleGuildEnabled(guildId, moduleName))) return false;

      // Specific "enabled" config field (some modules use this as a master switch)
      const configEnabled = await this.db.config.getModuleConfig(
        guildId,
        moduleName,
        "enabled",
      );
      if (configEnabled !== null && configEnabled !== undefined)
        return configEnabled !== false;

      // Fallback to module's default if not set in DB
      const record = container.moduleStore?.getRecord(moduleName);
      const field = record?.meta.configFields?.find((f) => f.key === "enabled");
      if (field) return field.default !== false;
    }

    return true;
  }

  /**
   * Batched variant of `isModuleEnabled` — resolves the global and guild enable
   * state for **all** requested modules in a single Redis MGET, then falls back
   * to DB only for any cache misses.  Use this when multiple modules need
   * checking on the same event (e.g. messageCreate) to avoid N separate
   * round-trips.
   *
   * @returns A `Map<moduleName, boolean>` for the supplied module names.
   */
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

      // Global enabled check — raw[i] is guaranteed in-bounds (half entries).
      const globalRaw = raw[i] ?? null;
      if (globalRaw === null) {
        // Cache miss — fall back to DB
        const globalEnabled = await this.isModuleGlobalEnabled(name);
        if (!globalEnabled) {
          result.set(name, false);
          continue;
        }
      } else {
        const globalEnabled = JSON.parse(globalRaw) as boolean;
        if (!globalEnabled) {
          result.set(name, false);
          continue;
        }
      }

      // Guild enabled check — raw[half + i] is guaranteed in-bounds.
      const guildRaw = raw[half + i] ?? null;
      if (guildRaw === null) {
        // Cache miss — fall back to DB
        const guildEnabled = await this.isModuleGuildEnabled(guildId, name);
        if (!guildEnabled) {
          result.set(name, false);
          continue;
        }
      } else {
        const guildEnabled = JSON.parse(guildRaw) as boolean;
        if (!guildEnabled) {
          result.set(name, false);
          continue;
        }
      }

      // Config-level "enabled" key check
      const configEnabled = await this.db.config.getModuleConfig(
        guildId,
        name,
        "enabled",
      );
      if (configEnabled !== null && configEnabled !== undefined) {
        result.set(name, configEnabled !== false);
        continue;
      }

      // Module default
      const record = container.moduleStore?.getRecord(name);
      const field = record?.meta.configFields?.find((f) => f.key === "enabled");
      result.set(name, field ? field.default !== false : true);
    }

    return result;
  }

  public async setModuleGuildEnabled(
    guildId: string,
    name: string,
    enabled: boolean,
  ) {
    const updated = await this.prisma.guildModuleState.upsert({
      where: { guildId_moduleName: { guildId, moduleName: name } },
      update: { enabled },
      create: { guildId, moduleName: name, enabled },
    });
    await this.invalidate(RedisKeys.moduleEnabled(name, guildId));
    return updated;
  }
}
