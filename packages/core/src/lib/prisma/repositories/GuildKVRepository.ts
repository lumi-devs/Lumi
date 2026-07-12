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
