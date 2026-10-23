import { TTL } from "@lumi/redis";
import { Repository, type RepositoryDeps } from "./base.ts";

export class ModuleStateRepository extends Repository {
  public constructor(deps: RepositoryDeps) {
    super(deps);
  }

  public isGlobalEnabled(module: string): Promise<boolean> {
    return this.deps.caches.module.getOrLoad(
      this.deps.keys.moduleGlobal(module),
      TTL.moduleState * 1_000,
      async () => {
        const row = await this.reader.globalModuleState.findUnique({
          where: { moduleName: module },
          select: { enabled: true },
        });
        return row?.enabled ?? true;
      },
    ) as Promise<boolean>;
  }

  public isGuildEnabled(guildId: string, module: string): Promise<boolean> {
    return this.deps.caches.module.getOrLoad(
      this.deps.keys.moduleGuild(guildId, module),
      TTL.moduleState * 1_000,
      async () => {
        const row = await this.reader.guildModuleState.findUnique({
          where: { guildId_moduleName: { guildId, moduleName: module } },
          select: { enabled: true },
        });
        return row?.enabled ?? true;
      },
    ) as Promise<boolean>;
  }

  public async isEnabled(guildId: string | null, module: string): Promise<boolean> {
    if (!guildId) return this.isGlobalEnabled(module);
    const [global, guild] = await Promise.all([
      this.isGlobalEnabled(module),
      this.isGuildEnabled(guildId, module),
    ]);
    return global && guild;
  }

  public async areEnabled(guildId: string | null, modules: readonly string[]): Promise<Map<string, boolean>> {
    const entries = await Promise.all(
      modules.map(async (module) => [module, await this.isEnabled(guildId, module)] as const),
    );
    return new Map(entries);
  }

  public async setGlobal(module: string, enabled: boolean): Promise<void> {
    await this.prisma.globalModuleState.upsert({
      where: { moduleName: module },
      update: { enabled },
      create: { moduleName: module, enabled },
    });
    await this.invalidate(this.deps.keys.moduleGlobal(module));
  }

  public async setGuild(guildId: string, module: string, enabled: boolean): Promise<void> {
    await this.prisma.guild.upsert({
      where: { id: guildId },
      create: { id: guildId },
      update: {},
    });
    await this.prisma.guildModuleState.upsert({
      where: { guildId_moduleName: { guildId, moduleName: module } },
      update: { enabled },
      create: { guildId, moduleName: module, enabled },
    });
    await this.invalidate(this.deps.keys.moduleGuild(guildId, module));
  }

  public async clearGlobal(module: string): Promise<void> {
    await this.prisma.globalModuleState.deleteMany({ where: { moduleName: module } });
    await this.invalidate(this.deps.keys.moduleGlobal(module));
  }
}
