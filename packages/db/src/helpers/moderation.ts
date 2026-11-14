import { Prisma } from "@prisma/client";
import type { DbContext } from "../context.js";

export const ModerationCaseTypes = {
  ban: "BAN",
  unban: "UNBAN",
  kick: "KICK",
  timeout: "TIMEOUT",
  warn: "WARN",
  note: "NOTE",
  softban: "SOFTBAN",
  quarantine: "QUARANTINE",
  unquarantine: "UNQUARANTINE",
  voice: "VOICE_MUTE",
  unvoice: "UNVOICE_MUTE",
} as const;

export type ModerationCaseKind = keyof typeof ModerationCaseTypes;

export function moderationCaseType(kind: ModerationCaseKind): string {
  return ModerationCaseTypes[kind];
}

export interface ModerationCaseInput {
  guildId: string;
  kind: ModerationCaseKind;
  targetId: string;
  moderatorId: string;
  reason?: string | null;
  messageId?: string | null;
  channelId?: string | null;
  metadata?: Prisma.InputJsonValue;
  duration?: number | null;
  expiresAt?: Date | null;
  active?: boolean;
}

export interface ModerationCaseUpdate {
  reason?: string | null;
  messageId?: string | null;
  channelId?: string | null;
  metadata?: Prisma.InputJsonValue;
  duration?: number | null;
  expiresAt?: Date | null;
  active?: boolean;
}

export const AnonymisedUserId = "000000000000000000";

const MaxCaseNumberAttempts = 5;

export function createModerationHelpers(ctx: DbContext) {
  const { prisma } = ctx;

  async function nextCaseNumber(guildId: string): Promise<number> {
    const latest = await prisma.moderationCase.findFirst({
      where: { guildId },
      orderBy: { caseNumber: "desc" },
      select: { caseNumber: true },
    });
    return (latest?.caseNumber ?? 0) + 1;
  }

  return {
    async create(input: ModerationCaseInput) {
      for (let attempt = 0; attempt < MaxCaseNumberAttempts; attempt++) {
        const caseNumber = await nextCaseNumber(input.guildId);
        try {
          return await prisma.moderationCase.create({
            data: {
              guildId: input.guildId,
              caseNumber,
              type: moderationCaseType(input.kind),
              targetId: input.targetId,
              moderatorId: input.moderatorId,
              reason: input.reason ?? null,
              messageId: input.messageId ?? null,
              channelId: input.channelId ?? null,
              metadata: input.metadata,
              duration: input.duration ?? null,
              expiresAt: input.expiresAt ?? null,
              active: input.active ?? true,
            },
          });
        } catch (error) {
          const conflict =
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002";
          if (!conflict || attempt === MaxCaseNumberAttempts - 1) throw error;
        }
      }
      throw new Error("Failed to allocate a moderation case number");
    },
    update: (id: string, patch: ModerationCaseUpdate) =>
      prisma.moderationCase.update({
        where: { id },
        data: patch,
      }),
    amend: async (
      guildId: string,
      caseNumber: number,
      patch: ModerationCaseUpdate,
    ) => {
      const existing = await prisma.moderationCase.findFirst({
        where: { guildId, caseNumber },
        select: { id: true },
      });
      if (!existing) return null;
      return prisma.moderationCase.update({
        where: { id: existing.id },
        data: patch,
      });
    },
    findByNumber: (guildId: string, caseNumber: number) =>
      prisma.moderationCase.findFirst({
        where: { guildId, caseNumber },
      }),
    findActive: (guildId: string, kind: ModerationCaseKind, targetId: string) =>
      prisma.moderationCase.findFirst({
        where: {
          guildId,
          type: moderationCaseType(kind),
          targetId,
          active: true,
        },
        orderBy: { createdAt: "desc" },
      }),
    close: (id: string) =>
      prisma.moderationCase.update({
        where: { id },
        data: { active: false },
      }),
    countForTarget: (guildId: string, targetId: string) =>
      prisma.moderationCase.count({
        where: { guildId, targetId },
      }),
    countActive: (
      guildId: string,
      kind: ModerationCaseKind,
      targetId: string,
    ) =>
      prisma.moderationCase.count({
        where: {
          guildId,
          targetId,
          type: moderationCaseType(kind),
          active: true,
        },
      }),
    listForTarget: (
      guildId: string,
      targetId: string,
      skip: number,
      take: number,
    ) =>
      prisma.moderationCase.findMany({
        where: { guildId, targetId },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
    async exportForUser(guildId: string, userId: string) {
      const cases = await prisma.moderationCase.findMany({
        where: { guildId, targetId: userId },
        orderBy: { caseNumber: "asc" },
      });
      return {
        guildId,
        userId,
        cases,
        notes: cases.filter((entry) => entry.type === "NOTE"),
      };
    },
    async anonymiseUser(guildId: string, userId: string) {
      const [asTarget, asModerator] = await Promise.all([
        prisma.moderationCase.updateMany({
          where: { guildId, targetId: userId },
          data: {
            targetId: AnonymisedUserId,
            reason: null,
            metadata: Prisma.DbNull,
          },
        }),
        prisma.moderationCase.updateMany({
          where: { guildId, moderatorId: userId },
          data: {
            moderatorId: AnonymisedUserId,
          },
        }),
      ]);
      return asTarget.count + asModerator.count;
    },
  };
}
