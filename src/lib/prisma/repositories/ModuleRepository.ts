import { CacheKeys, CacheTTL } from "#src/lib/cache/Keys.js";
import { type ILogger } from "#src/shared/Index.ts";
import { container } from "#src/lib/Services.js";
import type { DatabaseClient } from "#src/lib/prisma/Client.js";
import type { DatabaseService } from "#src/lib/prisma/DatabaseService.js";
import { Repository } from "#src/lib/prisma/repositories/Repository.js";
import type { ConfigRepository } from "#src/lib/prisma/repositories/ConfigRepository.js";

export class ModuleRepository extends Repository {
  public constructor(
    prisma: DatabaseClient,
    logger: ILogger,
    db: DatabaseService,
    private readonly config: ConfigRepository,
  ) {
    super(prisma, logger, db);
  }

  #isEssential(name: string): boolean {
    return name === "core" || name === "admin";
  }

  public isModuleGlobalEnabled(name: string): Promise<boolean> {
    if (this.#isEssential(name)) {
      return Promise.resolve(true);
    }
    return this.getOrSet(
      CacheKeys.moduleGlobalEnabled(name),
      CacheTTL.moduleEnabledCache,
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
    await this.invalidate(CacheKeys.moduleGlobalEnabled(name));
  }

  public async clearModuleGlobalState(name: string): Promise<void> {
    await this.prisma.globalModuleState.deleteMany({ where: { moduleName: name } });
    await this.invalidate(CacheKeys.moduleGlobalEnabled(name));
  }

  public async getGlobalModuleStates(): Promise<Map<string, boolean>> {
    const rows = await this.prisma.globalModuleState.findMany();
    return new Map(rows.map((r) => [r.moduleName, r.enabled]));
  }

  public async getGlobalModuleStatesDetailed(): Promise<
    { moduleName: string; enabled: boolean; reason: string | null }[]
  > {
    return this.prisma.globalModuleState.findMany({
      select: { moduleName: true, enabled: true, reason: true },
    });
  }

  public isModuleGuildEnabled(guildId: string, name: string): Promise<boolean> {
    if (this.#isEssential(name)) {
      return Promise.resolve(true);
    }
    return this.getOrSet(
      CacheKeys.moduleEnabled(name, guildId),
      CacheTTL.moduleEnabledCache,
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
    if (this.#isEssential(moduleName)) {
      return guildId ? this.#configLevelEnabled(guildId, moduleName) : true;
    }

    if (!guildId) {
      return this.isModuleGlobalEnabled(moduleName);
    }

    const result = await this.areModulesEnabled(guildId, [moduleName]);
    return result.get(moduleName)!;
  }

  public async areModulesEnabled(
    guildId: string,
    moduleNames: string[],
  ): Promise<Map<string, boolean>> {
    const [globalResults, guildResults] = await Promise.all([
      Promise.all(moduleNames.map((n) => this.isModuleGlobalEnabled(n))),
      Promise.all(moduleNames.map((n) => this.isModuleGuildEnabled(guildId, n))),
    ]);

    const passedGuild: number[] = [];
    for (let i = 0; i < moduleNames.length; i++) {
      if (globalResults[i] && guildResults[i]) passedGuild.push(i);
    }

    const configResolved = await Promise.all(
      passedGuild.map((i) => this.#configLevelEnabled(guildId, moduleNames[i]!)),
    );

    const enabled = new Array<boolean>(moduleNames.length).fill(false);
    for (const [k, i] of passedGuild.entries()) {
      enabled[i] = configResolved[k]!;
    }

    const result = new Map<string, boolean>();
    for (let i = 0; i < moduleNames.length; i++) {
      result.set(moduleNames[i]!, enabled[i]!);
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
    await this.db.ensureGuild(guildId);
    const updated = await this.prisma.guildModuleState.upsert({
      where: { guildId_moduleName: { guildId, moduleName: name } },
      update: { enabled },
      create: { guildId, moduleName: name, enabled },
    });
    await this.invalidate(CacheKeys.moduleEnabled(name, guildId));
    return updated;
  }

  async #configLevelEnabled(guildId: string, name: string): Promise<boolean> {
    const configEnabled = await this.config.getModuleConfig(
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
