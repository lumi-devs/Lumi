import type { Prisma } from "@prisma/client";
import type { DbContext } from "../context.js";

const TerminalReminderStatuses = ["delivered", "cancelled", "failed"] as const;

export interface ReminderCreateInput {
  guildId: string;
  userId: string;
  channelId: string | null;
  message: string;
  remindAt: Date;
  recurringCron: string | null;
}

export function createUtilityHelpers(ctx: DbContext) {
  const { prisma, cache } = ctx;

  return {
    afk: {
      findEntry: (guildId: string, userId: string) =>
        prisma.afkEntry
          .findUnique({
            where: { guildId_userId: { guildId, userId } },
          })
          .catch(() => null),
      listEntries: (guildId: string, userIds: string[]) =>
        prisma.afkEntry.findMany({
          where: { guildId, userId: { in: userIds } },
        }),
      upsertEntry: (guildId: string, userId: string, reason: string) =>
        prisma.afkEntry.upsert({
          where: { guildId_userId: { guildId, userId } },
          update: { reason, createdAt: new Date() },
          create: { guildId, userId, reason },
        }),
      deleteEntry: (guildId: string, userId: string) =>
        prisma.afkEntry.delete({
          where: { guildId_userId: { guildId, userId } },
        }),
      deleteByUser: (guildId: string, userId: string) =>
        prisma.afkEntry.deleteMany({ where: { guildId, userId } }),
      setRemovalCooldown: async (
        guildId: string,
        userId: string,
        ttlMs: number,
      ): Promise<void> => {
        try {
          await cache.set(`lumi:afk:cd:removal:${guildId}:${userId}`, 1, ttlMs);
        } catch {
          return;
        }
      },
      isRemovalCooldown: async (
        guildId: string,
        userId: string,
      ): Promise<boolean> => {
        try {
          const value = await cache.get<number>(
            `lumi:afk:cd:removal:${guildId}:${userId}`,
          );
          return value !== null && value !== undefined;
        } catch {
          return false;
        }
      },
    },
    reminders: {
      listActive: (guildId: string, userId: string, limit = 25) =>
        prisma.reminder.findMany({
          where: {
            guildId,
            userId,
            status: { notIn: [...TerminalReminderStatuses] },
          },
          orderBy: { remindAt: "asc" },
          take: limit,
        }),
      countActive: (guildId: string, userId: string) =>
        prisma.reminder.count({
          where: {
            guildId,
            userId,
            status: { notIn: [...TerminalReminderStatuses] },
          },
        }),
      listByUser: (guildId: string, userId: string) =>
        prisma.reminder.findMany({
          where: { guildId, userId },
          orderBy: { remindAt: "asc" },
        }),
      deleteByUser: (guildId: string, userId: string) =>
        prisma.reminder.deleteMany({ where: { guildId, userId } }),
      findExact: (id: string, guildId: string, userId: string) =>
        prisma.reminder.findFirst({
          where: { id, guildId, userId },
        }),
      findPrefixMatches: (
        guildId: string,
        userId: string,
        prefix: string,
        take = 2,
      ) =>
        prisma.reminder.findMany({
          where: {
            guildId,
            userId,
            id: { startsWith: prefix },
            status: { notIn: [...TerminalReminderStatuses] },
          },
          orderBy: { remindAt: "asc" },
          take,
        }),
      create: (input: ReminderCreateInput) =>
        prisma.reminder.create({
          data: {
            guildId: input.guildId,
            userId: input.userId,
            channelId: input.channelId,
            message: input.message,
            remindAt: input.remindAt,
            recurringCron: input.recurringCron,
            status: "pending",
          },
        }),
      cancel: (reminder: { id: string; guildId: string; userId: string }) =>
        prisma.reminder.updateMany({
          where: {
            id: reminder.id,
            guildId: reminder.guildId,
            userId: reminder.userId,
            status: { notIn: [...TerminalReminderStatuses] },
          },
          data: { status: "cancelled" },
        }),
      clear: (guildId: string, userId: string) =>
        prisma.reminder.updateMany({
          where: {
            guildId,
            userId,
            status: { notIn: [...TerminalReminderStatuses] },
          },
          data: { status: "cancelled" },
        }),
      snooze: (
        reminder: { id: string; guildId: string; userId: string },
        remindAt: Date,
      ) =>
        prisma.reminder.updateMany({
          where: {
            id: reminder.id,
            guildId: reminder.guildId,
            userId: reminder.userId,
            status: { notIn: [...TerminalReminderStatuses] },
          },
          data: { remindAt, status: "pending" },
        }),
      reclaimStale: (staleBefore: Date) =>
        prisma.reminder.updateMany({
          where: {
            status: "processing",
            remindAt: { lte: staleBefore },
          },
          data: { status: "pending" },
        }),
      findDue: (where: unknown, limit = 100) =>
        prisma.reminder.findMany({
          where: where as Prisma.ReminderWhereInput,
          orderBy: { remindAt: "asc" },
          take: limit,
        }),
      claim: (id: string, status: string) =>
        prisma.reminder.updateMany({
          where: { id, status },
          data: { status: "processing" },
        }),
      markDelivered: (
        id: string,
        deliveredAt: Date,
        nextRemindAt?: Date | null,
      ) => {
        const recurring = nextRemindAt !== null && nextRemindAt !== undefined;
        return prisma.reminder.updateMany({
          where: { id, status: "processing" },
          data: {
            status: recurring ? "pending" : "delivered",
            deliveredAt,
            ...(recurring ? { remindAt: nextRemindAt } : {}),
          },
        });
      },
      markRetry: (id: string, data: Prisma.ReminderUpdateManyMutationInput) =>
        prisma.reminder.updateMany({
          where: { id, status: "processing" },
          data,
        }),
      deleteRetention: (where: unknown) =>
        prisma.reminder.deleteMany({
          where: where as Prisma.ReminderWhereInput,
        }),
    },
    tempvc: {
      findChannel: async (channelId: string) => {
        try {
          return (
            (await prisma.tempVcChannel.findUnique({
              where: { channelId },
            })) ?? null
          );
        } catch {
          return null;
        }
      },
      listOwned: async (guildId: string, ownerId: string) => {
        try {
          const rows = await prisma.tempVcChannel.findMany({
            where: { guildId, ownerId },
            orderBy: { createdAt: "desc" },
          });
          return Array.isArray(rows) ? rows : [];
        } catch {
          return [];
        }
      },
      create: async (data: Prisma.TempVcChannelUncheckedCreateInput) => {
        try {
          await prisma.tempVcChannel.create({ data });
          return true;
        } catch {
          return false;
        }
      },
      update: async (channelId: string, data: Record<string, unknown>) => {
        try {
          await prisma.tempVcChannel.update({
            where: { channelId },
            data: data as Prisma.TempVcChannelUpdateInput,
          });
          return true;
        } catch {
          return false;
        }
      },
      delete: async (channelId: string) => {
        try {
          await prisma.tempVcChannel.delete({ where: { channelId } });
        } catch {
          return;
        }
      },
      deleteByOwner: (guildId: string, ownerId: string) =>
        prisma.tempVcChannel.deleteMany({ where: { guildId, ownerId } }),
      count: async (where: Prisma.TempVcChannelWhereInput) => {
        try {
          const count = await prisma.tempVcChannel.count({ where });
          return typeof count === "number" ? count : null;
        } catch {
          return null;
        }
      },
      listExpired: async () => {
        try {
          const rows = await prisma.tempVcChannel.findMany({
            where: { expiresAt: { not: null, lte: new Date() } },
          });
          return Array.isArray(rows) ? rows : [];
        } catch {
          return [];
        }
      },
      claimCreateCooldown: async (key: string, cooldownMs: number) => {
        try {
          return await cache.setNx(key, "1", cooldownMs);
        } catch {
          return true;
        }
      },
    },
  };
}
