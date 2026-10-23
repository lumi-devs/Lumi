import { Prisma } from "../../generated/client/index.js";
import { TTL } from "@lumi/redis";
import { Repository, type RepositoryDeps } from "./base.ts";

export type ModuleConfigMap = Record<string, unknown>;

export interface ConfigWriteOptions {
  actorId?: string | undefined;
}

export class ConfigRepository extends Repository {
  public constructor(deps: RepositoryDeps) {
    super(deps);
  }

  public getModuleConfig(guildId: string, module: string): Promise<ModuleConfigMap> {
    return this.deps.caches.config.getOrLoad(
      this.deps.keys.guildConfig(guildId, module),
      TTL.config * 1_000,
      async () => {
        const rows = await this.reader.guildModuleConfig.findMany({
          where: { guildId, moduleName: module },
          select: { configKey: true, value: true },
        });
        return Object.fromEntries(rows.map((row) => [row.configKey, row.value]));
      },
    ) as Promise<ModuleConfigMap>;
  }

  public async getModuleConfigValue(
    guildId: string,
    module: string,
    key: string,
  ): Promise<unknown | null> {
    const config = await this.getModuleConfig(guildId, module);
    return config[key] ?? null;
  }

  public getAllModuleConfigs(guildId: string): Promise<Record<string, ModuleConfigMap>> {
    return this.deps.caches.config.getOrLoad(
      this.deps.keys.guildConfigAll(guildId),
      TTL.config * 1_000,
      async () => {
        const rows = await this.reader.guildModuleConfig.findMany({
          where: { guildId },
          select: { moduleName: true, configKey: true, value: true },
        });
        const result: Record<string, ModuleConfigMap> = {};
        for (const row of rows) {
          const bucket = (result[row.moduleName] ??= {});
          bucket[row.configKey] = row.value;
        }
        return result;
      },
    ) as Promise<Record<string, ModuleConfigMap>>;
  }

  public async setModuleConfig(
    guildId: string,
    module: string,
    key: string,
    value: Prisma.InputJsonValue,
    options?: ConfigWriteOptions,
  ): Promise<void> {
    await this.prisma.guild.upsert({
      where: { id: guildId },
      create: { id: guildId },
      update: {},
    });

    if (options?.actorId) {
      const previous = await this.prisma.guildModuleConfig.findUnique({
        where: {
          guildId_moduleName_configKey: { guildId, moduleName: module, configKey: key },
        },
        select: { value: true },
      });
      await this.prisma.$transaction([
        this.prisma.guildModuleConfig.upsert({
          where: {
            guildId_moduleName_configKey: { guildId, moduleName: module, configKey: key },
          },
          update: { value },
          create: { guildId, moduleName: module, configKey: key, value },
        }),
        this.prisma.moduleConfigHistory.create({
          data: {
            guildId,
            moduleName: module,
            key,
            oldValue: previous?.value ?? Prisma.JsonNull,
            newValue: value,
            actorId: options.actorId,
          },
        }),
      ]);
    } else {
      await this.prisma.guildModuleConfig.upsert({
        where: {
          guildId_moduleName_configKey: { guildId, moduleName: module, configKey: key },
        },
        update: { value },
        create: { guildId, moduleName: module, configKey: key, value },
      });
    }

    await this.invalidate(
      this.deps.keys.guildConfig(guildId, module),
      this.deps.keys.guildConfigAll(guildId),
    );
  }

  public async deleteModuleConfigKey(guildId: string, module: string, key: string): Promise<void> {
    await this.prisma.guildModuleConfig.deleteMany({
      where: { guildId, moduleName: module, configKey: key },
    });
    await this.invalidate(
      this.deps.keys.guildConfig(guildId, module),
      this.deps.keys.guildConfigAll(guildId),
    );
  }

  public async clearModuleConfig(guildId: string, module: string): Promise<number> {
    const result = await this.prisma.guildModuleConfig.deleteMany({
      where: { guildId, moduleName: module },
    });
    await this.invalidate(
      this.deps.keys.guildConfig(guildId, module),
      this.deps.keys.guildConfigAll(guildId),
    );
    return result.count;
  }
}
