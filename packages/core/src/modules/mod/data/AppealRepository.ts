import type { Appeal } from "@prisma/client";
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
      skip?: number;
      take?: number;
      /** Opaque `(createdAt, id)` cursor - when given, pages by keyset instead of `skip` and `total` is omitted. */
      cursor?: string;
    } = {},
  ): Promise<{ appeals: Appeal[]; total?: number; nextCursor: string | null }> {
    const baseWhere = {
      guildId,
      ...(filter.status ? { status: filter.status } : {}),
    };
    const take = filter.take ?? 25;

    if (filter.cursor !== undefined) {
      const cursor = decodeCreatedAtIdCursor(filter.cursor);
      const where = { ...baseWhere, ...createdAtIdKeysetWhere(cursor) };
      const rows = await this.prisma.appeal.findMany({
        where,
        orderBy: CreatedAtIdOrderBy,
        take: take + 1,
      });
      const { page, hasMore } = splitPage(rows, take);
      const last = page.at(-1);
      return {
        appeals: page,
        nextCursor: hasMore && last ? encodeCreatedAtIdCursor(last) : null,
      };
    }

    const skip = filter.skip ?? 0;
    const [appeals, total] = await this.prisma.$transaction([
      this.prisma.appeal.findMany({
        where: baseWhere,
        orderBy: CreatedAtIdOrderBy,
        skip,
        take,
      }),
      this.prisma.appeal.count({ where: baseWhere }),
    ]);
    const last = appeals.at(-1);
    const nextCursor =
      skip + appeals.length < total && last ? encodeCreatedAtIdCursor(last) : null;

    return { appeals, total, nextCursor };
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
