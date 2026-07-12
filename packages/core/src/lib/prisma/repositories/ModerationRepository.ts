import type { ModerationCase } from "@prisma/client";
import { Repository } from "#lib/prisma/repositories/Repository.js";

/**
 * Moderation cases (`ModerationCase`) and the per-guild case counter
 * (`GuildCaseCounter`).
 */
export class ModerationRepository extends Repository {
  public createModerationCase(data: {
    guildId: string;
    userId: string;
    moderatorId: string;
    action: string;
    reason?: string;
    durationSeconds?: number;
    expiresAt?: Date;
  }): Promise<ModerationCase> {
    return this.prisma.$transaction(async (tx) => {
      const maxCase = await tx.moderationCase.findFirst({
        where: { guildId: data.guildId },
        orderBy: { caseNumber: "desc" },
        select: { caseNumber: true },
      });

      const maxNum = maxCase?.caseNumber ?? 0;

      const counter = await tx.guildCaseCounter.upsert({
        where: { guildId: data.guildId },
        create: { guildId: data.guildId, next: maxNum + 2 },
        update: { next: { increment: 1 } },
      });

      const caseNumber = Math.max(counter.next - 1, maxNum + 1);

      if (caseNumber >= counter.next) {
        await tx.guildCaseCounter.update({
          where: { guildId: data.guildId },
          data: { next: caseNumber + 1 },
        });
      }

      return tx.moderationCase.create({
        data: {
          guildId: data.guildId,
          caseNumber,
          userId: data.userId,
          moderatorId: data.moderatorId,
          action: data.action,
          reason: data.reason,
          duration: data.durationSeconds,
          expiresAt: data.expiresAt,
          active: true,
        },
      });
    });
  }

  public getModerationCases(
    guildId: string,
    userId: string,
    action?: string,
  ): Promise<ModerationCase[]> {
    return this.prisma.moderationCase.findMany({
      where: { guildId, userId, ...(action ? { action } : {}) },
      orderBy: { caseNumber: "desc" },
      take: 10,
    });
  }

  /**
   * Active (un-lifted) cases for a user, newest first. Optionally filtered by
   * action. Used to clear a prior active mute before applying a new one and to
   * let the lift handler skip a stale job that a re-mute has superseded.
   */
  public getActiveCases(
    guildId: string,
    userId: string,
    action?: string,
  ): Promise<ModerationCase[]> {
    return this.prisma.moderationCase.findMany({
      where: { guildId, userId, active: true, ...(action ? { action } : {}) },
      orderBy: { caseNumber: "desc" },
    });
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

  /** Active cases that have a future or past expiry — used to re-arm lift jobs on startup. */
  public getActiveExpiringCases(): Promise<ModerationCase[]> {
    return this.prisma.moderationCase.findMany({
      where: { active: true, expiresAt: { not: null } },
    });
  }

  public getModerationCaseById(id: number): Promise<ModerationCase | null> {
    return this.prisma.moderationCase.findUnique({ where: { id } });
  }

  public liftModerationCase(id: number): Promise<ModerationCase> {
    return this.prisma.moderationCase.update({
      where: { id },
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
}
