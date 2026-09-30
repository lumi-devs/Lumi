import type { Prisma } from "@prisma/client";
import { Repository } from "#lib/prisma/repositories/Repository.js";
import {
  purgeInBatchesWithArchive,
  type RetentionPurgeOptions,
} from "#lib/retention/archive.js";
import {
  createdAtIdKeysetWhere,
  CreatedAtIdOrderBy,
  decodeCreatedAtIdCursor,
  encodeCreatedAtIdCursor,
  splitPage,
} from "#lib/prisma/cursor.js";

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
    const take = filter.take ?? 25;
    const where =
      filter.cursor !== undefined
        ? { ...baseWhere, ...createdAtIdKeysetWhere(decodeCreatedAtIdCursor(filter.cursor)) }
        : baseWhere;

    const [rows, total] = await Promise.all([
      this.prisma.moduleConfigHistory.findMany({
        where,
        orderBy: CreatedAtIdOrderBy,
        take: take + 1,
      }),
      filter.cursor === undefined
        ? this.prisma.moduleConfigHistory.count({ where: baseWhere })
        : undefined,
    ]);
    const { page, hasMore } = splitPage(rows, take);
    const last = page.at(-1);
    return {
      entries: page,
      total,
      nextCursor: hasMore && last ? encodeCreatedAtIdCursor(last) : null,
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
