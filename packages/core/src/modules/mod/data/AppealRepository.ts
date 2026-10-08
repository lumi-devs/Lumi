import type { Appeal } from "@prisma/client";
import { Repository } from "#lib/prisma/repositories/Repository.js";
import {
  purgeInBatchesWithArchive,
  type RetentionPurgeOptions,
} from "#lib/retention/archive.js";
import {
  CreatedAtIdOrderBy,
  paginateCreatedAtId,
} from "#lib/prisma/cursor.js";

export type AppealStatus =
  | "pending"
  | "approved"
  | "denied"
  | "denied_blacklisted"
  | "dismissed";

/**
 * Ban/timeout appeals (`Appeal`), owned by the `mod` module. Submitted
 * publicly through a signed link (see `#modules/mod/services/appeal-token.js`) and reviewed
 * from the dashboard. One appeal per `ModerationCase` - enforced by the
 * unique `caseId` column, not re-checked here.
 */
export class AppealRepository extends Repository {
  public async create(
    guildId: string,
    userId: string,
    caseId: number,
    message: string,
  ): Promise<Appeal> {
    await this.db.ensureGuild(guildId);
    return this.prisma.appeal.create({
      // `status`/`createdAt` are set explicitly (rather than left to the
      // schema's `@default(...)`) so the offline mock Prisma client used in
      // tests - which does not evaluate column defaults - still produces a
      // real row shape.
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
      status?: AppealStatus;
      take?: number;
      /** Opaque `(createdAt, id)` cursor. Omitted for the first page, where `total` is also returned. */
      cursor?: string;
    } = {},
  ): Promise<{ appeals: Appeal[]; total?: number; nextCursor: string | null }> {
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

  /**
   * Reviews one appeal scoped to its guild, so an appeal id from another
   * guild can never be targeted. Only a "pending" appeal can be reviewed, so
   * two reviewers racing the same appeal can't both apply a decision.
   * Returns null if no matching pending row exists.
   */
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

  /**
   * Purges resolved appeals (anything but `pending`) older than `date`. A
   * pending appeal is never eligible regardless of age, mirroring
   * `ModerationRepository.purgeOldCases` never touching an active case.
   */
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
