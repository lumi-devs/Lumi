import type { Prisma } from "@prisma/client";
import { Repository } from "#lib/prisma/repositories/Repository.js";

/**
 * Generic per-module key/value storage (`ModuleData`), keyed by
 * `guildId + moduleName + targetId + key`.
 */
export class GuildKVRepository extends Repository {
  public async getModuleData<T = unknown>(
    guildId: string,
    module: string,
    targetId: string,
    key: string,
  ): Promise<T | null> {
    const r = await this.prisma.moduleData.findUnique({
      where: {
        guildId_moduleName_targetId_key: {
          guildId,
          moduleName: module,
          targetId,
          key,
        },
      },
    });
    return r ? (r.value as T) : null;
  }

  /**
   * Retrieves multiple module data entries for a guild and module in a single query.
   * Returns a Map keyed by `${targetId}:${key}`.
   */
  public async getModuleDataMany<T = unknown>(
    guildId: string,
    module: string,
    targets: { targetId: string; key: string }[],
  ): Promise<Map<string, T>> {
    const result = new Map<string, T>();
    if (targets.length === 0) return result;

    const rows = await this.prisma.moduleData.findMany({
      where: {
        guildId,
        moduleName: module,
        OR: targets.map((t) => ({ targetId: t.targetId, key: t.key })),
      },
    });

    for (const row of rows) {
      result.set(`${row.targetId}:${row.key}`, row.value as T);
    }
    return result;
  }

  public async setModuleData<T = unknown>(
    guildId: string,
    module: string,
    targetId: string,
    key: string,
    value: T,
  ) {
    await this.db.ensureGuild(guildId);
    await this.prisma.moduleData.upsert({
      where: {
        guildId_moduleName_targetId_key: {
          guildId,
          moduleName: module,
          targetId,
          key,
        },
      },
      update: { value: value as Prisma.InputJsonValue },
      create: {
        guildId,
        moduleName: module,
        targetId,
        key,
        value: value as Prisma.InputJsonValue,
      },
    });
  }

  /**
   * Bulk-reads every KV row for a `module + key`, optionally scoped to one
   * guild.  Returns `{ guildId, targetId, value }` so callers can rebuild a
   * `Map<targetId, value>` without touching Prisma directly.
   */
  public async listModuleData<T = unknown>(opts: {
    module: string;
    key: string;
    guildId?: string;
  }): Promise<{ guildId: string; targetId: string; value: T }[]> {
    const rows = await this.prisma.moduleData.findMany({
      where: {
        moduleName: opts.module,
        key: opts.key,
        ...(opts.guildId ? { guildId: opts.guildId } : {}),
      },
    });
    return rows.map((r) => ({
      guildId: r.guildId,
      targetId: r.targetId,
      value: r.value as T,
    }));
  }

  public async listGuildModuleData(
    guildId: string,
    filter: {
      moduleName?: string;
      targetId?: string;
      key?: string;
      skip?: number;
      take?: number;
    } = {},
  ): Promise<{
    entries: {
      moduleName: string;
      targetId: string;
      key: string;
      value: unknown;
    }[];
    total: number;
  }> {
    const where = {
      guildId,
      ...(filter.moduleName ? { moduleName: filter.moduleName } : {}),
      ...(filter.targetId ? { targetId: filter.targetId } : {}),
      ...(filter.key ? { key: filter.key } : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.moduleData.findMany({
        where,
        orderBy: [{ moduleName: "asc" }, { targetId: "asc" }, { key: "asc" }],
        skip: filter.skip ?? 0,
        take: filter.take ?? 25,
      }),
      this.prisma.moduleData.count({ where }),
    ]);

    return {
      entries: rows.map((r) => ({
        moduleName: r.moduleName,
        targetId: r.targetId,
        key: r.key,
        value: r.value,
      })),
      total,
    };
  }

  /** Deletes one KV row; returns the number of rows removed (0 or 1). */
  public async deleteModuleData(
    guildId: string,
    module: string,
    targetId: string,
    key: string,
  ): Promise<number> {
    const { count } = await this.prisma.moduleData.deleteMany({
      where: { guildId, moduleName: module, targetId, key },
    });
    return count;
  }

  /**
   * Every row a module keyed to one target, across every guild. Used for GDPR
   * erasure and export of a sandboxed addon's data, which the host owns on the
   * addon's behalf.
   */
  public async listModuleDataForTarget<T = unknown>(
    module: string,
    targetId: string,
  ): Promise<{ guildId: string; key: string; value: T }[]> {
    const rows = await this.prisma.moduleData.findMany({
      where: { moduleName: module, targetId },
    });
    return rows.map((r) => ({ guildId: r.guildId, key: r.key, value: r.value as T }));
  }

  /** {@linkcode listModuleDataForTarget}, but deleting. Returns the row count removed. */
  public async deleteModuleDataForTarget(
    module: string,
    targetId: string,
  ): Promise<number> {
    const { count } = await this.prisma.moduleData.deleteMany({
      where: { moduleName: module, targetId },
    });
    return count;
  }
}
