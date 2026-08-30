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
  ): Promise<GuildModuleConfig> {
    const result = await this.prisma.guildModuleConfig.upsert({
      where: {
        guildId_moduleName_configKey: { guildId, moduleName, configKey: key },
      },
      update: { value },
      create: { guildId, moduleName, configKey: key, value },
    });
    await this.invalidate(
      RedisKeys.guildConfig(moduleName, guildId),
      RedisKeys.guildAllModuleConfigs(guildId),
    );
    return result;
  }

  public async clearModuleConfig(
    guildId: string,
    moduleName: string,
  ): Promise<number> {
    const result = await this.prisma.guildModuleConfig.deleteMany({
      where: { guildId, moduleName },
    });
    await this.invalidate(
      RedisKeys.guildConfig(moduleName, guildId),
      RedisKeys.guildAllModuleConfigs(guildId),
    );
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
    await this.invalidate(
      RedisKeys.guildConfig(moduleName, guildId),
      RedisKeys.guildAllModuleConfigs(guildId),
    );
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
