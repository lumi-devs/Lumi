import type { Guild, GuildModuleConfig, Prisma } from "@prisma/client";
import { RedisKeys, RedisTTL } from "#lib/database/redis.js";
import { Repository } from "#lib/prisma/repositories/Repository.js";

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
    await this.invalidate(RedisKeys.guildSettings(guildId));
    if ("prefix" in data) {
      await this.invalidate(RedisKeys.guildPrefixes(guildId));
    }
    return result;
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

  public async getAllModuleConfigsForGuild(
    guildId: string,
  ): Promise<Map<string, Record<string, unknown>>> {
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
    await this.invalidate(RedisKeys.guildConfig(moduleName, guildId));
    return result;
  }

  public async clearModuleConfig(
    guildId: string,
    moduleName: string,
  ): Promise<number> {
    const result = await this.prisma.guildModuleConfig.deleteMany({
      where: { guildId, moduleName },
    });
    await this.invalidate(RedisKeys.guildConfig(moduleName, guildId));
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
    await this.invalidate(RedisKeys.guildConfig(moduleName, guildId));
  }
}
