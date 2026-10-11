import type { Appeal } from "@prisma/client";
import { Repository } from "#src/lib/prisma/repositories/Repository.js";
import {
  purgeInBatchesWithArchive,
  type RetentionPurgeOptions,
} from "#src/lib/Retention.js";
import {
  CreatedAtIdOrderBy,
  paginateCreatedAtId,
} from "#src/lib/prisma/Cursor.js";

export type AppealStatus =
  | "pending"
  | "approved"
  | "denied"
  | "denied_blacklisted"
  | "dismissed";

export class AppealRepository extends Repository {
  public async create(
    guildId: string,
    userId: string,
    caseId: number,
    message: string,
  ): Promise<Appeal> {
    await this.db.ensureGuild(guildId);
    return this.prisma.appeal.create({
      data: {
        guildId,
        userId,
        caseId,
        message,
        status: "pending",
        createdAt: new Date(),
      },
    });
  }

  public findByCaseId(caseId: number): Promise<Appeal | null> {
    return this.prisma.appeal.findUnique({ where: { caseId } });
  }

  public async listForGuild(
    guildId: string,
    filter: {
      status?: AppealStatus | undefined;
      take?: number | undefined;

      cursor?: string | undefined;
    } = {},
  ): Promise<{ appeals: Appeal[]; total?: number | undefined; nextCursor: string | null }> {
    const baseWhere = {
      guildId,
      ...(filter.status ? { status: filter.status } : {}),
    };
    const result = await paginateCreatedAtId(
      (where) =>
        this.prisma.appeal.findMany({
          where: where as never,
          orderBy: CreatedAtIdOrderBy,
          take: (filter.take ?? 25) + 1,
        }),
      (where) => this.prisma.appeal.count({ where: where as never }),
      baseWhere,
      filter,
    );
    return {
      appeals: result.rows,
      total: result.total,
      nextCursor: result.nextCursor,
    };
  }

  public async review(
    guildId: string,
    id: number,
    status: AppealStatus,
    reviewedBy: string,
  ): Promise<Appeal | null> {
    const { count } = await this.prisma.appeal.updateMany({
      where: { id, guildId, status: "pending" },
      data: { status, reviewedBy, reviewedAt: new Date() },
    });
    if (count === 0) return null;
    return this.prisma.appeal.findUnique({ where: { id } });
  }

  public async purgeOldAppeals(
    date: Date,
    options: RetentionPurgeOptions = {},
  ): Promise<number> {
    return purgeInBatchesWithArchive({
      table: "appeals",
      archiveDir: options.archiveDir,
      batchSize: options.batchSize,
      logger: this.logger,
      findBatch: (afterId, batchSize) =>
        this.prisma.appeal.findMany({
          where: {
            createdAt: { lt: date },
            status: { not: "pending" },
            ...(afterId === null ? {} : { id: { gt: afterId } }),
          },
          orderBy: { id: "asc" },
          take: batchSize,
        }),
      deleteByIds: async (ids) => {
        const { count } = await this.prisma.appeal.deleteMany({
          where: { id: { in: ids } },
        });
        return count;
      },
    });
  }
}
