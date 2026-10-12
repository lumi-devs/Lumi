import type { Guild, GuildModuleConfig, Prisma } from "@prisma/client";
import { type ILogger } from "#src/shared/Index.ts";
import type {ValkeyClient} from "#src/lib/valkey/Cluster.js";
import { ValkeyKeys, ValkeyTTL } from "#src/lib/valkey/Store.js";
import type { DatabaseClient } from "#src/lib/prisma/Client.js";
import type { DatabaseService } from "#src/lib/prisma/DatabaseService.js";
import { Repository } from "#src/lib/prisma/repositories/Repository.js";
import type { ConfigHistoryRepository } from "#src/lib/prisma/repositories/ConfigHistoryRepository.js";

export type ScopedConfigScope = "global" | "channel" | "role" | "user" | "member" | "custom";

interface ScopeLevel {
  guildId: string;
  scope: ScopedConfigScope;
  scopeId: string;
}

export function scopeCascade(
  guildId: string,
  scope: ScopedConfigScope,
  scopeId: string,
): ScopeLevel[] {
  const g = (s: ScopedConfigScope, id: string, gid: string): ScopeLevel => ({
    guildId: gid,
    scope: s,
    scopeId: id,
  });
  switch (scope) {
    case "member":
      return [
        g("member", scopeId, guildId),
        g("user", scopeId, ""),
        g("global", "", ""),
      ];
    case "user":
      return [g("user", scopeId, ""), g("global", "", "")];
    case "channel":
    case "role":
    case "custom":
      return [g(scope, scopeId, guildId), g("global", "", "")];
    case "global":
      return [g("global", "", "")];
  }
}

export class ConfigRepository extends Repository {
  public constructor(
    prisma: DatabaseClient,
    valkey: ValkeyClient,
    logger: ILogger,
    db: DatabaseService,
    private readonly configHistory: ConfigHistoryRepository,
  ) {
    super(prisma, valkey, logger, db);
  }

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
      ValkeyKeys.guildSettings(guildId),
      ValkeyTTL.guildConfig,
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

  public async invalidateGuildSettings(guildId: string): Promise<void> {
    await this.invalidate(ValkeyKeys.guildSettings(guildId));
  }

  public async getModuleConfig(
    guildId: string,
    moduleName: string,
    key: string,
  ): Promise<unknown> {
    const map = await this.getAllModuleConfig(guildId, moduleName);
    return map[key] ?? null;
  }

  public getScopedRows(
    moduleName: string,
    guildId: string,
    scope: ScopedConfigScope,
    scopeId: string,
  ): Promise<Record<string, unknown>> {
    const cacheKey = ValkeyKeys.scopedConfig(moduleName, guildId, scope, scopeId);
    return this.getOrSet(cacheKey, ValkeyTTL.scopedConfig, async () => {
      const rows = await this.prisma.moduleScopedConfig.findMany({
        where: { guildId, moduleName, scope, scopeId },
      });
      return Object.fromEntries(rows.map((r) => [r.configKey, r.value]));
    });
  }

  public getGlobalRows(moduleName: string): Promise<Record<string, unknown>> {
    return this.getScopedRows(moduleName, "", "global", "");
  }

  public async getScopedConfig(
    guildId: string,
    moduleName: string,
    scope: ScopedConfigScope,
    scopeId: string,
    key: string,
  ): Promise<unknown> {
    const all = await this.getAllScopedConfig(guildId, moduleName, scope, scopeId);
    return all[key] ?? null;
  }

  public async getAllScopedConfig(
    guildId: string,
    moduleName: string,
    scope: ScopedConfigScope,
    scopeId: string,
  ): Promise<Record<string, unknown>> {
    const levels = scopeCascade(guildId, scope, scopeId);
    const [scopedMaps, guildMap] = await Promise.all([
      Promise.all(
        levels.map((l) => this.getScopedRows(moduleName, l.guildId, l.scope, l.scopeId)),
      ),
      scope === "global" || scope === "user"
        ? Promise.resolve({} as Record<string, unknown>)
        : this.getAllModuleConfig(guildId, moduleName),
    ]);
    const merged: Record<string, unknown> = {};
    for (let i = scopedMaps.length - 1; i >= 0; i--) {
      const level = levels[i]!;
      const map = scopedMaps[i]!;
      if (level.scope === "global") {
        Object.assign(merged, map, guildMap);
      } else {
        Object.assign(merged, map);
      }
    }
    return merged;
  }

  public async setScopedConfig(
    guildId: string,
    moduleName: string,
    scope: ScopedConfigScope,
    scopeId: string,
    key: string,
    value: Prisma.InputJsonValue,
    actorId?: string,
  ): Promise<void> {
    if (scope !== "global" && guildId) {
      await this.db.ensureGuild(guildId);
    }
    const oldValue = actorId
      ? await this.getScopedConfig(guildId, moduleName, scope, scopeId, key)
      : null;
    await this.prisma.moduleScopedConfig.upsert({
      where: {
        guildId_moduleName_scope_scopeId_configKey: {
          guildId,
          moduleName,
          scope,
          scopeId,
          configKey: key,
        },
      },
      update: { value },
      create: { guildId, moduleName, scope, scopeId, configKey: key, value },
    });
    await this.invalidate(
      ValkeyKeys.scopedConfig(moduleName, guildId, scope, scopeId),
    );
    if (actorId) {
      this.configHistory
        .logConfigChange({
          guildId,
          moduleName,
          key: `${scope}:${scopeId || "-"}/${key}`,
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
  }

  public async deleteScopedConfigKey(
    guildId: string,
    moduleName: string,
    scope: ScopedConfigScope,
    scopeId: string,
    key: string,
  ): Promise<void> {
    await this.prisma.moduleScopedConfig.deleteMany({
      where: { guildId, moduleName, scope, scopeId, configKey: key },
    });
    await this.invalidate(
      ValkeyKeys.scopedConfig(moduleName, guildId, scope, scopeId),
    );
  }

  public async clearScopedConfig(
    guildId: string,
    moduleName: string,
    scope: ScopedConfigScope,
    scopeId: string,
  ): Promise<number> {
    const result = await this.prisma.moduleScopedConfig.deleteMany({
      where: { guildId, moduleName, scope, scopeId },
    });
    await this.invalidate(
      ValkeyKeys.scopedConfig(moduleName, guildId, scope, scopeId),
    );
    return result.count;
  }

  public getAllModuleConfig(
    guildId: string,
    moduleName: string,
  ): Promise<Record<string, unknown>> {
    const cacheKey = ValkeyKeys.guildConfig(moduleName, guildId);
    return this.getOrSet(cacheKey, ValkeyTTL.guildConfig, async () => {
      const configs = await this.prisma.guildModuleConfig.findMany({
        where: { guildId, moduleName },
      });
      return Object.fromEntries(configs.map((c) => [c.configKey, c.value]));
    });
  }

  public getAllModuleConfigsForGuild(
    guildId: string,
  ): Promise<Map<string, Record<string, unknown>>> {
    const cacheKey = ValkeyKeys.guildAllModuleConfigs(guildId);
    return this.getOrSet(
      cacheKey,
      ValkeyTTL.guildAllModuleConfigs,
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
    await this.db.ensureGuild(guildId);
    const result = await this.prisma.guildModuleConfig.upsert({
      where: {
        guildId_moduleName_configKey: { guildId, moduleName, configKey: key },
      },
      update: { value },
      create: { guildId, moduleName, configKey: key, value },
    });
    await this.invalidateModuleConfig(guildId, moduleName);
    if (actorId) {
      this.configHistory
        .logConfigChange({
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

  private async invalidateModuleConfig(
    guildId: string,
    moduleName: string,
  ): Promise<void> {
    await this.invalidate(
      ValkeyKeys.guildConfig(moduleName, guildId),
      ValkeyKeys.guildAllModuleConfigs(guildId),
    );
  }

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

}
