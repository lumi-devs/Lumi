import type { Prisma } from "@prisma/client";
import { Repository } from "@lumi/lib/prisma/repositories/repository.js";
import {
  purgeInBatchesWithArchive,
  type RetentionPurgeOptions,
} from "@lumi/lib/retention.js";
import {
  CreatedAtIdOrderBy,
  paginateCreatedAtId,
} from "@lumi/lib/prisma/cursor.js";

export interface ConfigHistoryEntry {
  id: number;
  guildId: string;
  moduleName: string;
  key: string;
  oldValue: unknown;
  newValue: unknown;
  actorId: string;
  createdAt: Date;
}

/** Audit trail of config changes (`ModuleConfigHistory`). */
export class ConfigHistoryRepository extends Repository {
  public async logConfigChange(data: {
    guildId: string;
    moduleName: string;
    key: string;
    oldValue: unknown;
    newValue: unknown;
    actorId: string;
  }): Promise<void> {
    await this.db.ensureGuild(data.guildId);
    await this.prisma.moduleConfigHistory.create({
      data: {
        guildId: data.guildId,
        moduleName: data.moduleName,
        key: data.key,
        oldValue: data.oldValue ?? undefined,
        newValue: data.newValue as Prisma.InputJsonValue,
        actorId: data.actorId,
      },
    });
  }

  public getConfigHistory(
    guildId: string,
    moduleName: string,
    key?: string,
    take = 10,
  ): Promise<ConfigHistoryEntry[]> {
    return this.prisma.moduleConfigHistory.findMany({
      where: { guildId, moduleName, ...(key ? { key } : {}) },
      orderBy: { createdAt: "desc" },
      take,
    });
  }

  public async listGuildConfigHistory(
    guildId: string,
    filter: {
      moduleName?: string;
      key?: string;
      actorId?: string;
      take?: number;
      /** Opaque `(createdAt, id)` cursor. Omitted for the first page, where `total` is also returned. */
      cursor?: string;
    } = {},
  ): Promise<{ entries: ConfigHistoryEntry[]; total?: number; nextCursor: string | null }> {
    const baseWhere = {
      guildId,
      ...(filter.moduleName ? { moduleName: filter.moduleName } : {}),
      ...(filter.key ? { key: filter.key } : {}),
      ...(filter.actorId ? { actorId: filter.actorId } : {}),
    };
    const result = await paginateCreatedAtId(
      (where) =>
        this.prisma.moduleConfigHistory.findMany({
          where: where as Prisma.ModuleConfigHistoryWhereInput,
          orderBy: CreatedAtIdOrderBy,
          take: (filter.take ?? 25) + 1,
        }),
      (where) =>
        this.prisma.moduleConfigHistory.count({
          where: where as Prisma.ModuleConfigHistoryWhereInput,
        }),
      baseWhere,
      filter,
    );
    return {
      entries: result.rows,
      total: result.total,
      nextCursor: result.nextCursor,
    };
  }

  public getConfigHistoryEntry(id: number): Promise<ConfigHistoryEntry | null> {
    return this.prisma.moduleConfigHistory.findUnique({
      where: { id },
    });
  }

  public async purgeOldEntries(
    date: Date,
    options: RetentionPurgeOptions = {},
  ): Promise<number> {
    return purgeInBatchesWithArchive({
      table: "module_config_history",
      archiveDir: options.archiveDir,
      batchSize: options.batchSize,
      logger: this.logger,
      findBatch: (afterId, batchSize) =>
        this.prisma.moduleConfigHistory.findMany({
          where: {
            createdAt: { lt: date },
            ...(afterId === null ? {} : { id: { gt: afterId } }),
          },
          orderBy: { id: "asc" },
          take: batchSize,
        }),
      deleteByIds: async (ids) => {
        const { count } = await this.prisma.moduleConfigHistory.deleteMany({
          where: { id: { in: ids } },
        });
        return count;
      },
    });
  }
}
