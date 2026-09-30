import type { Appeal } from "@prisma/client";
import { Repository } from "#lib/prisma/repositories/Repository.js";
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
      take?: number;
      /** Opaque `(createdAt, id)` cursor. Omitted for the first page, where `total` is also returned. */
      cursor?: string;
    } = {},
  ): Promise<{ appeals: Appeal[]; total?: number; nextCursor: string | null }> {
    const baseWhere = {
      guildId,
      ...(filter.status ? { status: filter.status } : {}),
    };
    const take = filter.take ?? 25;
    const where =
      filter.cursor !== undefined
        ? { ...baseWhere, ...createdAtIdKeysetWhere(decodeCreatedAtIdCursor(filter.cursor)) }
        : baseWhere;

    const [rows, total] = await Promise.all([
      this.prisma.appeal.findMany({
        where,
        orderBy: CreatedAtIdOrderBy,
        take: take + 1,
      }),
      filter.cursor === undefined ? this.prisma.appeal.count({ where: baseWhere }) : undefined,
    ]);
    const { page, hasMore } = splitPage(rows, take);
    const last = page.at(-1);
    return {
      appeals: page,
      total,
      nextCursor: hasMore && last ? encodeCreatedAtIdCursor(last) : null,
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
}
