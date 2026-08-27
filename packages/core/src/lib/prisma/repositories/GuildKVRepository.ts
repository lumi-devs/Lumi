import type { Prisma } from "@prisma/client";
import { Repository } from "#lib/prisma/repositories/Repository.js";
import { acquireRedisLock } from "#core/lib/redis-lock.js";

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

  public async setModuleData<T = unknown>(
    guildId: string,
    module: string,
    targetId: string,
    key: string,
    value: T,
  ) {
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

  /**
   * Atomic read-modify-write for one KV row, guarded by a Redis lock scoped
   * to (guildId, module, targetId, key) - for addon code that would
   * otherwise do `getModuleData` then `setModuleData` by hand and race a
   * concurrent writer (e.g. appending to a list). Mirrors Redbot's `async
   * with config...() as l:` context-manager pattern. `mutator` returning
   * `undefined` deletes the row instead of writing it.
   */
  public async mutateModuleData<T = unknown>(
    guildId: string,
    module: string,
    targetId: string,
    key: string,
    mutator: (current: T | null) => T | undefined | Promise<T | undefined>,
  ): Promise<T | undefined> {
    const { release } = await acquireRedisLock(
      this.redis,
      `lock:kv-mutate:${module}:${guildId}:${targetId}:${key}`,
    );
    try {
      const current = await this.getModuleData<T>(guildId, module, targetId, key);
      const next = await mutator(current);
      if (next === undefined) {
        await this.deleteModuleData(guildId, module, targetId, key);
      } else {
        await this.setModuleData(guildId, module, targetId, key, next);
      }
      return next;
    } finally {
      await release();
    }
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
   * Deletes many KV rows for a `module + key` across `{ guildId, targetId }`
   * targets in a single query; returns the number of rows removed.
   */
  public async deleteModuleDataMany(
    module: string,
    key: string,
    targets: { guildId: string; targetId: string }[],
  ): Promise<number> {
    if (targets.length === 0) return 0;
    const { count } = await this.prisma.moduleData.deleteMany({
      where: {
        moduleName: module,
        key,
        OR: targets.map((t) => ({ guildId: t.guildId, targetId: t.targetId })),
      },
    });
    return count;
  }
}
