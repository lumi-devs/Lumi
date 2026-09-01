import type { Guild, GuildModuleConfig, Prisma } from "@prisma/client";
import { RedisKeys, RedisTTL } from "#lib/database/redis.js";
import { Repository } from "#lib/prisma/repositories/Repository.js";
import { acquireRedisLock } from "#core/lib/redis-lock.js";

/** Repository for guild settings and module configurations. */
export class ConfigRepository extends Repository {
  public async isDashboardEnabled(guildId: string): Promise<boolean> {
    const val = await this.getModuleConfig(
      guildId,
      "core",
      "dashboard_enabled",
    );
    return val !== false;
  }

  public getGuildSettings(guildId: string): Promise<Readonly<Guild>> {
    return this.getOrSet(
      RedisKeys.guildSettings(guildId),
      RedisTTL.guildConfig,
      () => {
        return this.prisma.guild.upsert({
          where: { id: guildId },
          create: { id: guildId },
          update: {},
        });
      },
      (raw) => {
        const parsed = JSON.parse(raw) as Guild;
        return {
          ...parsed,
          createdAt: new Date(parsed.createdAt),
          updatedAt: new Date(parsed.updatedAt),
        };
      },
    );
  }

  public async updateGuildSettings(
    guildId: string,
    data: Partial<Omit<Guild, "id" | "createdAt" | "updatedAt">>,
  ) {
    const result = await this.prisma.guild.update({
      where: { id: guildId },
      data,
    });
    await this.invalidateGuildSettings(guildId, "prefix" in data);
    return result;
  }

  /** Invalidates the guild settings cache and, optionally, the prefix cache. */
  public async invalidateGuildSettings(
    guildId: string,
    prefixChanged = false,
  ): Promise<void> {
    const keys = [RedisKeys.guildSettings(guildId)];
    if (prefixChanged) keys.push(RedisKeys.guildPrefixes(guildId));
    await this.invalidate(...keys);
  }

  public async getModuleConfig(
    guildId: string,
    moduleName: string,
    key: string,
  ): Promise<unknown> {
    const map = await this.getAllModuleConfig(guildId, moduleName);
    return map[key] ?? null;
  }

  public getAllModuleConfig(
    guildId: string,
    moduleName: string,
  ): Promise<Record<string, unknown>> {
    const cacheKey = RedisKeys.guildConfig(moduleName, guildId);
    return this.getOrSet(cacheKey, RedisTTL.guildConfig, async () => {
      const configs = await this.prisma.guildModuleConfig.findMany({
        where: { guildId, moduleName },
      });
      return Object.fromEntries(configs.map((c) => [c.configKey, c.value]));
    });
  }

  public getAllModuleConfigsForGuild(
    guildId: string,
  ): Promise<Map<string, Record<string, unknown>>> {
    const cacheKey = RedisKeys.guildAllModuleConfigs(guildId);
    return this.getOrSet(
      cacheKey,
      RedisTTL.guildAllModuleConfigs,
      async () => {
        const configs = await this.prisma.guildModuleConfig.findMany({
          where: { guildId },
        });
        const result = new Map<string, Record<string, unknown>>();
        for (const c of configs) {
          if (!result.has(c.moduleName)) {
            result.set(c.moduleName, {});
          }
          result.get(c.moduleName)![c.configKey] = c.value;
        }
        return result;
      },
      (raw) => new Map(JSON.parse(raw)),
      (map) => JSON.stringify([...map.entries()]),
    );
  }

  public async setModuleConfig(
    guildId: string,
    moduleName: string,
    key: string,
    value: Prisma.InputJsonValue,
    actorId?: string,
  ): Promise<GuildModuleConfig> {
    let oldValue: unknown = null;
    if (actorId) {
      oldValue = await this.getModuleConfig(guildId, moduleName, key);
    }
    const result = await this.prisma.guildModuleConfig.upsert({
      where: {
        guildId_moduleName_configKey: { guildId, moduleName, configKey: key },
      },
      update: { value },
      create: { guildId, moduleName, configKey: key, value },
    });
    await this.invalidateModuleConfig(guildId, moduleName);
    if (actorId) {
      this.db.configHistory
        ?.logConfigChange({
          guildId,
          moduleName,
          key,
          oldValue,
          newValue: value,
          actorId,
        })
        .catch((err: unknown) =>
          this.logger.warn(
            `[ConfigRepository] Failed to write audit history for ${moduleName}:${key}:`,
            err,
          ),
        );
    }
    return result;
  }

  /** Invalidates the per-module and all-modules config caches for a guild. */
  private async invalidateModuleConfig(
    guildId: string,
    moduleName: string,
  ): Promise<void> {
    await this.invalidate(
      RedisKeys.guildConfig(moduleName, guildId),
      RedisKeys.guildAllModuleConfigs(guildId),
    );
  }

  /**
   * Retrieves specific configuration keys for a module in a guild, utilizing cached module config.
   */
  public async getModuleConfigs(
    guildId: string,
    moduleName: string,
    keys: string[],
  ): Promise<Record<string, unknown>> {
    if (keys.length === 0) return {};
    const all = await this.getAllModuleConfig(guildId, moduleName);
    const result: Record<string, unknown> = {};
    for (const key of keys) {
      if (key in all) {
        result[key] = all[key];
      }
    }
    return result;
  }

  /**
   * Upserts multiple module configuration keys in a single transaction and invalidates caches.
   */
  public async setModuleConfigsMany(
    guildId: string,
    moduleName: string,
    entries: Record<string, Prisma.InputJsonValue>,
    actorId?: string,
  ): Promise<void> {
    const keys = Object.keys(entries);
    if (keys.length === 0) return;

    let oldValues: Record<string, unknown> = {};
    if (actorId) {
      oldValues = await this.getModuleConfigs(guildId, moduleName, keys);
    }

    await this.prisma.$transaction(
      keys.map((configKey) =>
        this.prisma.guildModuleConfig.upsert({
          where: {
            guildId_moduleName_configKey: {
              guildId,
              moduleName,
              configKey,
            },
          },
          create: {
            guildId,
            moduleName,
            configKey,
            value: entries[configKey]!,
          },
          update: {
            value: entries[configKey]!,
          },
        }),
      ),
    );

    await this.invalidateModuleConfig(guildId, moduleName);

    if (actorId) {
      for (const [key, value] of Object.entries(entries)) {
        this.db.configHistory
          ?.logConfigChange({
            guildId,
            moduleName,
            key,
            oldValue: oldValues[key] ?? null,
            newValue: value,
            actorId,
          })
          .catch((err: unknown) =>
            this.logger.warn(
              `[ConfigRepository] Failed to write audit history for ${moduleName}:${key}:`,
              err,
            ),
          );
      }
    }
  }

  public async clearModuleConfig(
    guildId: string,
    moduleName: string,
  ): Promise<number> {
    const result = await this.prisma.guildModuleConfig.deleteMany({
      where: { guildId, moduleName },
    });
    await this.invalidateModuleConfig(guildId, moduleName);
    return result.count;
  }

  public async deleteModuleConfigKey(
    guildId: string,
    moduleName: string,
    key: string,
  ): Promise<void> {
    await this.prisma.guildModuleConfig.deleteMany({
      where: { guildId, moduleName, configKey: key },
    });
    await this.invalidateModuleConfig(guildId, moduleName);
  }

  /**
   * Atomic read-modify-write for one config key, guarded by a Redis lock
   * scoped to (guildId, moduleName, key) - Redbot's `async with
   * config.guild(g).some_list() as l:` pattern, for addon authors who'd
   * otherwise do get-then-set by hand and race a concurrent writer.
   * `mutator` returning `undefined` deletes the key instead of writing it.
   */
  public async mutateModuleConfig<T = unknown>(
    guildId: string,
    moduleName: string,
    key: string,
    mutator: (current: T | null) => T | undefined | Promise<T | undefined>,
  ): Promise<T | undefined> {
    const { release } = await acquireRedisLock(
      this.redis,
      `lock:config-mutate:${moduleName}:${guildId}:${key}`,
    );
    try {
      const current = (await this.getModuleConfig(guildId, moduleName, key)) as T | null;
      const next = await mutator(current);
      if (next === undefined) {
        await this.deleteModuleConfigKey(guildId, moduleName, key);
      } else {
        await this.setModuleConfig(guildId, moduleName, key, next as Prisma.InputJsonValue);
      }
      return next;
    } finally {
      await release();
    }
  }
}
