import { Prisma, type CaseAction, type CaseTypeSetting, type ModerationCase } from "@prisma/client";
import { ValkeyKeys, ValkeyTTL } from "#src/lib/valkey/Store.js";
import { Repository } from "#src/lib/prisma/repositories/Repository.js";
import {
  purgeInBatchesWithArchive,
  type RetentionPurgeOptions,
} from "#src/lib/Retention.js";
import {
  decodeSingleKeyCursor,
  encodeSingleKeyCursor,
  singleKeyKeysetWhere,
  splitPage,
} from "#src/lib/prisma/Cursor.js";

const SweepPageSize = 500;

export class ModerationRepository extends Repository {
  public findCaseTypeSetting(
    guildId: string,
    name: string,
  ): Promise<CaseTypeSetting | null> {
    return this.prisma.caseTypeSetting.findUnique({
      where: { guildId_name: { guildId, name } },
    });
  }

  public async upsertCaseTypeSetting(
    guildId: string,
    name: string,
    patch: { enabled?: boolean; channelId?: string | null; emoji?: string | null },
  ): Promise<CaseTypeSetting> {
    await this.db.ensureGuild(guildId);
    return this.prisma.caseTypeSetting.upsert({
      where: { guildId_name: { guildId, name } },
      update: {
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
        ...(patch.channelId !== undefined ? { channelId: patch.channelId } : {}),
        ...(patch.emoji !== undefined ? { emoji: patch.emoji } : {}),
      },
      create: {
        guildId,
        name,
        enabled: patch.enabled ?? true,
        channelId: patch.channelId ?? null,
        emoji: patch.emoji ?? null,
      },
    });
  }

  public async createModerationCase(data: {
    guildId: string;
    userId: string;
    moderatorId: string;
    action: CaseAction;
    customType?: string | undefined;
    reason?: string | undefined;
    durationSeconds?: number | undefined;
    expiresAt?: Date | undefined;
  }): Promise<ModerationCase> {
    await this.db.ensureGuild(data.guildId);

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

    try {
      return await this.prisma.moderationCase.create({
        data: {
          guildId: data.guildId,
          caseNumber: row.caseNumber,
          userId: data.userId,
          moderatorId: data.moderatorId,
          action: data.action,
          customAction: data.customType ?? null,
          reason: data.reason ?? null,
          duration: data.durationSeconds ?? null,
          expiresAt: data.expiresAt ?? null,
          active: true,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        const existing = await this.prisma.moderationCase.findUnique({
          where: {
            uq_cases_guild_number: {
              guildId: data.guildId,
              caseNumber: row.caseNumber,
            },
          },
        });
        if (existing) return existing;
      }
      throw err;
    }
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
      action?: CaseAction | undefined;
      userId?: string | undefined;
      moderatorId?: string | undefined;
      take?: number | undefined;

      cursor?: string | undefined;
    } = {},
  ): Promise<{ cases: ModerationCase[]; total?: number | undefined; nextCursor: string | null }> {
    const baseWhere = {
      guildId,
      ...(filter.action ? { action: filter.action } : {}),
      ...(filter.userId ? { userId: filter.userId } : {}),
      ...(filter.moderatorId ? { moderatorId: filter.moderatorId } : {}),
    };
    const take = filter.take ?? 25;
    const where =
      filter.cursor !== undefined
        ? {
            ...baseWhere,
            ...singleKeyKeysetWhere("caseNumber", decodeSingleKeyCursor(filter.cursor)),
          }
        : baseWhere;

    const [rows, total] = await Promise.all([
      this.prisma.moderationCase.findMany({
        where,
        orderBy: { caseNumber: "desc" },
        take: take + 1,
      }),
      filter.cursor === undefined
        ? this.prisma.moderationCase.count({ where: baseWhere })
        : undefined,
    ]);
    const { page, hasMore } = splitPage(rows, take);
    const last = page.at(-1);
    return {
      cases: page,
      total,
      nextCursor: hasMore && last ? encodeSingleKeyCursor(last.caseNumber) : null,
    };
  }

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

  public isVoiceMuted(guildId: string, userId: string): Promise<boolean> {
    return this.getOrSet(
      ValkeyKeys.voiceMuteState(guildId, userId),
      ValkeyTTL.voiceMute,
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

  public async liftModerationCases(ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    await this.prisma.moderationCase.updateMany({
      where: { id: { in: ids } },
      data: { active: false },
    });
  }

  public async updateCaseReason(id: number, reason: string): Promise<void> {
    await this.prisma.moderationCase.update({
      where: { id },
      data: { reason },
    });
  }

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
    duration?: number | undefined;
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
        duration: data.duration ?? null,
      },
      update: {
        action: data.action,
        duration: data.duration ?? null,
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
    thresholds: Array<{ warnCount: number; action: CaseAction; duration?: number | undefined }>,
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
            duration: t.duration ?? null,
          })),
        });
      }
    });
  }

  public async purgeOldCases(
    date: Date,
    options: RetentionPurgeOptions = {},
  ): Promise<number> {
    return purgeInBatchesWithArchive({
      table: "moderation_cases",
      archiveDir: options.archiveDir,
      batchSize: options.batchSize,
      logger: this.logger,
      findBatch: (afterId, batchSize) =>
        this.prisma.moderationCase.findMany({
          where: {
            createdAt: { lt: date },
            active: false,
            ...(afterId === null ? {} : { id: { gt: afterId } }),
          },
          orderBy: { id: "asc" },
          take: batchSize,
        }),
      deleteByIds: async (ids) => {
        const { count } = await this.prisma.moderationCase.deleteMany({
          where: { id: { in: ids } },
        });
        return count;
      },
    });
  }
}
