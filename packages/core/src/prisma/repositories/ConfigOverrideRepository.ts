import type { Prisma } from "@prisma/client";
import { Repository } from "#root/prisma/repositories/Repository.js";

export interface ConfigOverrideEntry {
  id: string;
  guildId: string;
  moduleName: string;
  key: string;
  modelType: string;
  modelId: string;
  value: unknown;
}

/**
 * Per-scope config overrides (`ModuleConfigOverride`) — user/channel/role/
 * category/guild values layered over the base module config.
 */
export class ConfigOverrideRepository extends Repository {
  public async setConfigOverride(data: {
    guildId: string;
    moduleName: string;
    key: string;
    modelType: string;
    modelId: string;
    value: unknown;
  }): Promise<void> {
    await this.prisma.moduleConfigOverride.upsert({
      where: {
        uq_config_override: {
          guildId: data.guildId,
          moduleName: data.moduleName,
          key: data.key,
          modelType: data.modelType,
          modelId: data.modelId,
        },
      },
      create: { ...data, value: data.value as Prisma.InputJsonValue },
      update: { value: data.value as Prisma.InputJsonValue },
    });
  }

  public getConfigOverrides(
    guildId: string,
    moduleName: string,
    key?: string,
  ): Promise<ConfigOverrideEntry[]> {
    return this.prisma.moduleConfigOverride.findMany({
      where: { guildId, moduleName, ...(key ? { key } : {}) },
    });
  }

  public async deleteConfigOverride(data: {
    guildId: string;
    moduleName: string;
    key: string;
    modelType: string;
    modelId: string;
  }): Promise<boolean> {
    const result = await this.prisma.moduleConfigOverride.deleteMany({
      where: data,
    });
    return result.count > 0;
  }
}
