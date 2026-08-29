import { RedisKeys, RedisTTL } from "#lib/database/redis.js";
import { mgetSafe } from "#lib/database/cluster-safe.js";
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

  /** Deletes the global override row entirely, returning the module to following each guild's own setting. */
  public async clearModuleGlobalState(name: string): Promise<void> {
    await this.prisma.globalModuleState.deleteMany({ where: { moduleName: name } });
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

  /**
   * Runs on essentially every guild command's precondition check, so the
   * global+guild lookup goes through {@linkcode areModulesEnabled}'s single
   * batched `mget` rather than two sequential Redis round trips.
   */
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

  /** Batched variant of isModuleEnabled checking multiple modules in one roundtrip. */
  public async areModulesEnabled(
    guildId: string,
    moduleNames: string[],
  ): Promise<Map<string, boolean>> {
    const globalKeys = moduleNames.map((n) => RedisKeys.moduleGlobalEnabled(n));
    const guildKeys = moduleNames.map((n) =>
      RedisKeys.moduleEnabled(n, guildId),
    );

    const raw = await mgetSafe(this.redis, [...globalKeys, ...guildKeys]);
    const half = moduleNames.length;

    const enabled = new Array<boolean>(half).fill(false);

    const globalMisses: number[] = [];
    const passedGlobal: number[] = [];
    for (let i = 0; i < half; i++) {
      const globalRaw = raw[i] ?? null;
      if (globalRaw === null) {
        globalMisses.push(i);
      } else if (tryParseJSON(globalRaw) === true) {
        passedGlobal.push(i);
      }
    }

    const globalResolved = await Promise.all(
      globalMisses.map((i) => this.isModuleGlobalEnabled(moduleNames[i]!)),
    );
    for (const [k, i] of globalMisses.entries()) {
      if (globalResolved[k]) {
        passedGlobal.push(i);
      }
    }

    const guildMisses: number[] = [];
    const passedGuild: number[] = [];
    for (const i of passedGlobal) {
      const guildRaw = raw[half + i] ?? null;
      if (guildRaw === null) {
        guildMisses.push(i);
      } else if (tryParseJSON(guildRaw) === true) {
        passedGuild.push(i);
      }
    }

    const guildResolved = await Promise.all(
      guildMisses.map((i) => this.isModuleGuildEnabled(guildId, moduleNames[i]!)),
    );
    for (const [k, i] of guildMisses.entries()) {
      if (guildResolved[k]) {
        passedGuild.push(i);
      }
    }

    const configResolved = await Promise.all(
      passedGuild.map((i) => this.#configLevelEnabled(guildId, moduleNames[i]!)),
    );
    for (const [k, i] of passedGuild.entries()) {
      enabled[i] = configResolved[k]!;
    }

    const result = new Map<string, boolean>();
    for (let i = 0; i < half; i++) {
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
