import type {
  CaseAction,
  ModerationCase,
  ModNote,
} from "../../generated/client/index.js";
import { Repository, type RepositoryDeps } from "./base.ts";

export interface CreateCaseInput {
  userId: string;
  moderatorId: string;
  action: CaseAction;
  customAction?: string | null | undefined;
  reason?: string | null | undefined;
  duration?: number | null | undefined;
  expiresAt?: Date | null | undefined;
}

export interface ListCasesOptions {
  userId?: string | undefined;
  action?: CaseAction | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

const MaxCasePageSize = 100;

export class ModerationRepository extends Repository {
  public constructor(deps: RepositoryDeps) {
    super(deps);
  }

  /**
   * Allocates the next per-guild case number and inserts the case in one
   * transaction. The counter row is the serialization point: concurrent calls
   * block on the upsert and each receives a distinct `next` value.
   */
  public async createCase(guildId: string, input: CreateCaseInput): Promise<ModerationCase> {
    return this.prisma.$transaction(async (tx) => {
      await tx.guild.upsert({
        where: { id: guildId },
        create: { id: guildId },
        update: {},
      });

      const counter = await tx.guildCaseCounter.upsert({
        where: { guildId },
        create: { guildId, next: 1 },
        update: { next: { increment: 1 } },
      });

      return tx.moderationCase.create({
        data: {
          guildId,
          caseNumber: counter.next,
          userId: input.userId,
          moderatorId: input.moderatorId,
          action: input.action,
          customAction: input.customAction ?? null,
          reason: input.reason ?? null,
          duration: input.duration ?? null,
          expiresAt: input.expiresAt ?? null,
          active: true,
        },
      });
    });
  }

  public async getCase(guildId: string, caseNumber: number): Promise<ModerationCase | null> {
    return this.reader.moderationCase.findUnique({
      where: {
        uq_cases_guild_number: {
          guildId,
          caseNumber,
        },
      },
    });
  }

  public async listCases(
    guildId: string,
    options: ListCasesOptions = {},
  ): Promise<ModerationCase[]> {
    const { userId, action, limit = 20, offset = 0 } = options;

    return this.reader.moderationCase.findMany({
      where: {
        guildId,
        ...(userId === undefined ? {} : { userId }),
        ...(action === undefined ? {} : { action }),
      },
      orderBy: { caseNumber: "desc" },
      take: Math.min(MaxCasePageSize, Math.max(1, limit)),
      skip: Math.max(0, offset),
    });
  }

  public async countCases(
    guildId: string,
    userId?: string,
    action?: CaseAction,
  ): Promise<number> {
    return this.reader.moderationCase.count({
      where: {
        guildId,
        ...(userId === undefined ? {} : { userId }),
        ...(action === undefined ? {} : { action }),
      },
    });
  }

  public async listActiveCases(
    guildId: string,
    userId: string,
    action: CaseAction,
  ): Promise<ModerationCase[]> {
    return this.reader.moderationCase.findMany({
      where: { guildId, userId, action, active: true },
      orderBy: { caseNumber: "asc" },
    });
  }

  /**
   * Marks every live case for one action inactive. Undo actions such as
   * `unmute`, `unquarantine`, and `unvoice_mute` call this before recording
   * their own case so `/cases` reflects what is actually in force.
   */
  public async deactivateActiveCases(
    guildId: string,
    userId: string,
    action: CaseAction,
  ): Promise<number> {
    const result = await this.prisma.moderationCase.updateMany({
      where: { guildId, userId, action, active: true },
      data: { active: false },
    });
    return result.count;
  }

  public async updateCaseReason(
    guildId: string,
    caseNumber: number,
    reason: string,
  ): Promise<ModerationCase | null> {
    const result = await this.prisma.moderationCase.updateMany({
      where: { guildId, caseNumber },
      data: { reason },
    });
    if (result.count === 0) return null;
    // Read back from the primary: the cached/replica read can lag immediately
    // after the write and make an updated case look missing.
    return this.prisma.moderationCase.findUnique({
      where: { uq_cases_guild_number: { guildId, caseNumber } },
    });
  }

  public async setCaseActive(
    guildId: string,
    caseNumber: number,
    active: boolean,
  ): Promise<boolean> {
    const result = await this.prisma.moderationCase.updateMany({
      where: { guildId, caseNumber },
      data: { active },
    });
    return result.count > 0;
  }

  /**
   * Removes a case created by an action Discord rejected. Case numbers are
   * intentionally not reused; a gap is preferable to a misleading audit row.
   */
  public async deleteCase(guildId: string, caseNumber: number): Promise<boolean> {
    const result = await this.prisma.moderationCase.deleteMany({
      where: { guildId, caseNumber },
    });
    return result.count > 0;
  }

  /**
   * Active, expiring cases that have run out. Used by the lift task to mark
   * timeouts inactive and retry failed removals on the next pass.
   */
  public async listExpiredActive(now = new Date(), limit = 100): Promise<ModerationCase[]> {
    return this.reader.moderationCase.findMany({
      where: {
        active: true,
        expiresAt: { lte: now },
      },
      orderBy: { expiresAt: "asc" },
      take: Math.min(MaxCasePageSize, Math.max(1, limit)),
    });
  }

  public async createNote(
    guildId: string,
    userId: string,
    authorId: string,
    message: string,
  ): Promise<ModNote> {
    await this.prisma.guild.upsert({
      where: { id: guildId },
      create: { id: guildId },
      update: {},
    });

    return this.prisma.modNote.create({
      data: {
        guildId,
        userId,
        authorId,
        message: message.slice(0, 1_000),
      },
    });
  }

  public async listNotes(guildId: string, userId: string): Promise<ModNote[]> {
    return this.reader.modNote.findMany({
      where: { guildId, userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }

  public async deleteNote(guildId: string, noteId: number): Promise<boolean> {
    const result = await this.prisma.modNote.deleteMany({
      where: { guildId, id: noteId },
    });
    return result.count > 0;
  }
}
