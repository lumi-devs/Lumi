import type { Appeal } from "@prisma/client";
import { Repository } from "#lib/prisma/repositories/Repository.js";

export type AppealStatus =
  | "pending"
  | "approved"
  | "denied"
  | "denied_blacklisted"
  | "dismissed";

/**
 * Ban/timeout appeals (`Appeal`), owned by the `mod` module. Submitted
 * publicly through a signed link (see `#lib/appeals/token.js`) and reviewed
 * from the dashboard. One appeal per `ModerationCase` - enforced by the
 * unique `caseId` column, not re-checked here.
 */
export class AppealRepository extends Repository {
  public create(
    guildId: string,
    userId: string,
    caseId: number,
    message: string,
  ): Promise<Appeal> {
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
    filter: { status?: AppealStatus; skip?: number; take?: number } = {},
  ): Promise<{ appeals: Appeal[]; total: number }> {
    const where = {
      guildId,
      ...(filter.status ? { status: filter.status } : {}),
    };

    const [appeals, total] = await this.prisma.$transaction([
      this.prisma.appeal.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: filter.skip ?? 0,
        take: filter.take ?? 25,
      }),
      this.prisma.appeal.count({ where }),
    ]);

    return { appeals, total };
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
