import { Prisma, type CaseAction, type ModerationCase } from "@prisma/client";
import { RedisKeys, RedisTTL } from "#lib/database/redis.js";
import { Repository } from "#lib/prisma/repositories/Repository.js";

/** Batch size for the cross-guild sweeps, which are unbounded by nature. */
const SweepPageSize = 500;

/**
 * Moderation cases (`ModerationCase`) and the per-guild case counter
 * (`GuildCaseCounter`).
 */
export class ModerationRepository extends Repository {
  public async createModerationCase(data: {
    guildId: string;
    userId: string;
    moderatorId: string;
    action: CaseAction;
    reason?: string;
    durationSeconds?: number;
    expiresAt?: Date;
  }): Promise<ModerationCase> {
    await this.db.ensureGuild(data.guildId);

    // Reserves the next case number with one atomic upsert: Postgres's own
    // row-level ON CONFLICT locking serializes concurrent reservations for
    // the same guildId, so no application transaction, isolation level, or
    // retry loop is needed - unlike a read-then-write, two racing callers
    // physically cannot be handed the same number.
    const reserved = await this.prisma.$queryRaw<{ caseNumber: number }[]>(
      Prisma.sql`
        INSERT INTO "guild_case_counter" ("guild_id", "next")
        VALUES (${data.guildId}, 2)
        ON CONFLICT ("guild_id") DO UPDATE SET "next" = "guild_case_counter"."next" + 1
        RETURNING "next" - 1 AS "caseNumber"
      `,
    );
    const row = reserved[0];
    if (!row) {
      throw new Error(
        `Case counter upsert for guild ${data.guildId} returned no row.`,
      );
    }

    return this.prisma.moderationCase.create({
      data: {
        guildId: data.guildId,
        caseNumber: row.caseNumber,
        userId: data.userId,
        moderatorId: data.moderatorId,
        action: data.action,
        reason: data.reason,
        duration: data.durationSeconds,
        expiresAt: data.expiresAt,
        active: true,
      },
    });
  }

  public getModerationCases(
    guildId: string,
    userId: string,
    action?: CaseAction,
  ): Promise<ModerationCase[]> {
    return this.prisma.moderationCase.findMany({
      where: { guildId, userId, ...(action ? { action } : {}) },
      orderBy: { caseNumber: "desc" },
      take: 10,
    });
  }

  public countModerationCases(
    guildId: string,
    userId: string,
    action?: CaseAction,
  ): Promise<number> {
    return this.prisma.moderationCase.count({
      where: { guildId, userId, ...(action ? { action } : {}) },
    });
  }

  public async listCases(
    guildId: string,
    filter: {
      action?: CaseAction;
      userId?: string;
      moderatorId?: string;
      skip?: number;
      take?: number;
    } = {},
  ): Promise<{ cases: ModerationCase[]; total: number }> {
    const where = {
      guildId,
      ...(filter.action ? { action: filter.action } : {}),
      ...(filter.userId ? { userId: filter.userId } : {}),
      ...(filter.moderatorId ? { moderatorId: filter.moderatorId } : {}),
    };

    const [cases, total] = await this.prisma.$transaction([
      this.prisma.moderationCase.findMany({
        where,
        orderBy: { caseNumber: "desc" },
        skip: filter.skip ?? 0,
        take: filter.take ?? 25,
      }),
      this.prisma.moderationCase.count({ where }),
    ]);

    return { cases, total };
  }

  /**
   * Active (un-lifted) cases for a user, newest first. Optionally filtered by
   * action. Used to clear a prior active mute before applying a new one and to
   * let the lift handler skip a stale job that a re-mute has superseded.
   */
  public getActiveCases(
    guildId: string,
    userId: string,
    action?: CaseAction,
  ): Promise<ModerationCase[]> {
    return this.prisma.moderationCase.findMany({
      where: { guildId, userId, active: true, ...(action ? { action } : {}) },
      orderBy: { caseNumber: "desc" },
    });
  }

  /**
   * Whether the user has an active `voice_mute` case, cached both positive
   * and negative - the common case (no active mute) is checked on every
   * relevant `voiceStateUpdate` and would otherwise pay a Postgres query per
   * channel join forever.
   */
  public isVoiceMuted(guildId: string, userId: string): Promise<boolean> {
    return this.getOrSet(
      RedisKeys.voiceMuteState(guildId, userId),
      RedisTTL.voiceMute,
      () =>
        this.prisma.moderationCase
          .count({
            where: { guildId, userId, action: "voice_mute", active: true },
          })
          .then((n) => n > 0),
    );
  }

  public getModerationCase(
    guildId: string,
    caseNumber: number,
  ): Promise<ModerationCase | null> {
    return this.prisma.moderationCase.findUnique({
      where: { uq_cases_guild_number: { guildId, caseNumber } },
    });
  }

  public async deleteModerationCase(
    guildId: string,
    caseNumber: number,
  ): Promise<boolean> {
    const result = await this.prisma.moderationCase.deleteMany({
      where: { guildId, caseNumber },
    });
    return result.count > 0;
  }

  /**
   * Active cases that have a future or past expiry - used to re-arm lift jobs
   * on startup. Yielded in keyset-paginated batches so peak memory stays flat
   * as guild count and case history grow, rather than loading the whole active
   * backlog in one round trip.
   */
  public iterateActiveExpiringCases(
    pageSize = SweepPageSize,
  ): AsyncGenerator<ModerationCase[]> {
    return this.#iterateCases(
      { active: true, expiresAt: { not: null } },
      pageSize,
    );
  }

  public iterateActiveWarnCases(
    pageSize = SweepPageSize,
  ): AsyncGenerator<ModerationCase[]> {
    return this.#iterateCases({ action: "warn", active: true }, pageSize);
  }

  async *#iterateCases(
    where: Prisma.ModerationCaseWhereInput,
    pageSize: number,
  ): AsyncGenerator<ModerationCase[]> {
    let cursor: number | undefined;

    // Fleet-wide scans, and both callers converge on the next run if a page is
    // slightly stale: the startup re-arm reschedules jobs that are idempotent,
    // and warn decay re-evaluates every tick. Safe to keep off the primary.
    for (;;) {
      const page = await this.reader.moderationCase.findMany({
        where,
        orderBy: { id: "asc" },
        take: pageSize,
        ...(cursor === undefined
          ? {}
          : { cursor: { id: cursor }, skip: 1 }),
      });

      if (page.length === 0) return;
      yield page;
      if (page.length < pageSize) return;
      cursor = page[page.length - 1]!.id;
    }
  }

  public getModerationCaseById(id: number): Promise<ModerationCase | null> {
    return this.prisma.moderationCase.findUnique({ where: { id } });
  }

  /** Fetches many cases in one round trip - for batch lookups like appeals list pagination. */
  public getModerationCasesByIds(ids: number[]): Promise<ModerationCase[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return this.prisma.moderationCase.findMany({ where: { id: { in: ids } } });
  }

  public liftModerationCase(id: number): Promise<ModerationCase> {
    return this.prisma.moderationCase.update({
      where: { id },
      data: { active: false },
    });
  }

  /** Lifts many cases in one round trip - for batch jobs like warn decay. */
  public async liftModerationCases(ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    await this.prisma.moderationCase.updateMany({
      where: { id: { in: ids } },
      data: { active: false },
    });
  }

  /** Edits the reason on a single case (by primary key). */
  public async updateCaseReason(id: number, reason: string): Promise<void> {
    await this.prisma.moderationCase.update({
      where: { id },
      data: { reason },
    });
  }

  /**
   * GDPR anonymization: blanks a user out of every case they appear in, as
   * either the target or the acting moderator (sets the id to `"0"`).
   */
  public async anonymizeUser(userId: string): Promise<void> {
    await this.prisma.moderationCase.updateMany({
      where: { userId },
      data: { userId: "0" },
    });
    await this.prisma.moderationCase.updateMany({
      where: { moderatorId: userId },
      data: { moderatorId: "0" },
    });
  }

  public findCasesForUser(userId: string): Promise<ModerationCase[]> {
    return this.prisma.moderationCase.findMany({
      where: { OR: [{ userId }, { moderatorId: userId }] },
      orderBy: { createdAt: "desc" },
    });
  }

  public getWarnThresholds(guildId: string) {
    return this.prisma.warnThreshold.findMany({
      where: { guildId },
      orderBy: { warnCount: "asc" },
    });
  }

  public async setWarnThreshold(data: {
    guildId: string;
    warnCount: number;
    action: CaseAction;
    duration?: number;
  }) {
    await this.db.ensureGuild(data.guildId);
    return this.prisma.warnThreshold.upsert({
      where: {
        guildId_warnCount: {
          guildId: data.guildId,
          warnCount: data.warnCount,
        },
      },
      create: {
        guildId: data.guildId,
        warnCount: data.warnCount,
        action: data.action,
        duration: data.duration,
      },
      update: {
        action: data.action,
        duration: data.duration,
      },
    });
  }

  public removeWarnThreshold(guildId: string, warnCount: number) {
    return this.prisma.warnThreshold.deleteMany({
      where: { guildId, warnCount },
    });
  }

  public resetWarnThresholds(guildId: string) {
    return this.prisma.warnThreshold.deleteMany({
      where: { guildId },
    });
  }

  public async setBulkWarnThresholds(
    guildId: string,
    thresholds: Array<{ warnCount: number; action: CaseAction; duration?: number }>,
  ) {
    await this.db.ensureGuild(guildId);
    return this.prisma.$transaction(async (tx) => {
      await tx.warnThreshold.deleteMany({ where: { guildId } });
      if (thresholds.length > 0) {
        await tx.warnThreshold.createMany({
          data: thresholds.map((t) => ({
            guildId,
            warnCount: t.warnCount,
            action: t.action,
            duration: t.duration,
          })),
        });
      }
    });
  }

  public async purgeOldCases(date: Date): Promise<number> {
    const { count } = await this.prisma.moderationCase.deleteMany({
      where: {
        createdAt: { lt: date },
        OR: [
          { active: false },
          { expiresAt: { lt: new Date() } }
        ]
      },
    });
    return count;
  }
}
