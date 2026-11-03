import type { Prisma } from "@prisma/client";
import type { DbContext } from "../context.js";

export interface AutorolePendingAddInput {
  guildId: string;
  userId: string;
  roleIds: string[];
  assignAt: Date;
}

export interface AutoroleDueFilters {
  guildId?: string;
  userId?: string;
}

export interface BulkRoleJobAddInput {
  guildId: string;
  roleId: string;
  action: string;
  filter: unknown;
  total: number;
  createdBy: string;
}

export interface BulkRoleJobUpdateInput {
  status?: string;
  processed?: number;
  failed?: number;
  total?: number;
  lastError?: string | null;
}

export interface BulkRoleJobIncrementInput {
  status?: string;
  lastError?: string | null;
}

export interface VoiceRoleMappingInput {
  guildId: string;
  channelId: string;
  categoryId: string | null;
  roleId: string;
  graceSeconds: number;
}

export interface VoiceSessionInput {
  guildId: string;
  userId: string;
  channelId: string;
  roleId: string;
  nowMs: number;
}

export function createRoleHelpers(ctx: DbContext) {
  const { prisma } = ctx;

  return {
    autorole: {
      findByUser: (guildId: string, userId: string) =>
        prisma.autorolePending
          .findUnique({
            where: {
              guildId_userId: { guildId, userId },
            },
          })
          .catch(() => null),
      updatePending: (
        id: string,
        input: { roleIds: string[]; assignAt: Date },
      ) =>
        prisma.autorolePending.update({
          where: { id },
          data: {
            roleIds: input.roleIds,
            assignAt: input.assignAt,
          },
        }),
      createPending: (input: AutorolePendingAddInput) =>
        prisma.autorolePending.create({
          data: {
            guildId: input.guildId,
            userId: input.userId,
            roleIds: input.roleIds,
            assignAt: input.assignAt,
          },
        }),
      listDue: (
        nowMs: number,
        limit: number,
        filters: AutoroleDueFilters = {},
      ) =>
        prisma.autorolePending.findMany({
          where: {
            assignAt: { lte: new Date(nowMs) },
            ...(filters.guildId ? { guildId: filters.guildId } : {}),
            ...(filters.userId ? { userId: filters.userId } : {}),
          },
          orderBy: { assignAt: "asc" },
          take: limit,
        }),
      count: (guildId: string) =>
        prisma.autorolePending.count({ where: { guildId } }),
      async cancel(guildId: string, userId?: string): Promise<number> {
        const result = await prisma.autorolePending.deleteMany({
          where: { guildId, ...(userId ? { userId } : {}) },
        });
        return result.count;
      },
      deletePending: (id: string) =>
        prisma.autorolePending.delete({ where: { id } }).catch(() => undefined),
    },
    bulkRole: {
      create: (input: BulkRoleJobAddInput) =>
        prisma.bulkRoleJob.create({
          data: {
            guildId: input.guildId,
            roleId: input.roleId,
            action: input.action,
            filter: input.filter as Prisma.InputJsonValue,
            status: "pending",
            total: input.total,
            createdBy: input.createdBy,
          },
        }),
      listRunnable: (limit: number) =>
        prisma.bulkRoleJob.findMany({
          where: { status: { in: ["pending", "running"] } },
          orderBy: { createdAt: "asc" },
          take: limit,
        }),
      find: (guildId: string, jobId: string) =>
        prisma.bulkRoleJob.findFirst({
          where: { id: jobId, guildId },
        }),
      listGuild: (guildId: string, limit: number) =>
        prisma.bulkRoleJob.findMany({
          where: { guildId },
          orderBy: { createdAt: "desc" },
          take: limit,
        }),
      listByCreator: (guildId: string, userId: string) =>
        prisma.bulkRoleJob.findMany({
          where: { guildId, createdBy: userId },
          orderBy: { createdAt: "desc" },
        }),
      anonymiseCreator: (guildId: string, userId: string) =>
        prisma.bulkRoleJob.updateMany({
          where: { guildId, createdBy: userId },
          data: { createdBy: "deleted-user" },
        }),
      async update(
        jobId: string,
        input: BulkRoleJobUpdateInput,
      ): Promise<void> {
        const update: Prisma.BulkRoleJobUpdateInput = {};
        if (input.status !== undefined) update.status = input.status;
        if (input.processed !== undefined) update.processed = input.processed;
        if (input.failed !== undefined) update.failed = input.failed;
        if (input.total !== undefined) update.total = input.total;
        if (input.lastError !== undefined) update.lastError = input.lastError;
        if (Object.keys(update).length === 0) return;
        await prisma.bulkRoleJob
          .update({ where: { id: jobId }, data: update })
          .catch(() => undefined);
      },
      async increment(
        jobId: string,
        succeeded: number,
        failed: number,
        input: BulkRoleJobIncrementInput = {},
      ): Promise<void> {
        const update: Prisma.BulkRoleJobUpdateInput = {};
        if (succeeded > 0) update.processed = { increment: succeeded };
        if (failed > 0) update.failed = { increment: failed };
        if (input.status !== undefined) update.status = input.status;
        if (input.lastError !== undefined) update.lastError = input.lastError;
        if (Object.keys(update).length === 0) return;
        await prisma.bulkRoleJob
          .update({ where: { id: jobId }, data: update })
          .catch(() => undefined);
      },
      updateStatus: (jobId: string, status: string) =>
        prisma.bulkRoleJob.update({
          where: { id: jobId },
          data: { status },
        }),
    },
    voiceRole: {
      listMappings: (guildId: string) =>
        prisma.voiceRole.findMany({
          where: { guildId },
          orderBy: { channelId: "asc" },
        }),
      findMapping: (guildId: string, channelId: string) =>
        prisma.voiceRole.findUnique({
          where: { guildId_channelId: { guildId, channelId } },
        }),
      upsertMapping: (input: VoiceRoleMappingInput) =>
        prisma.voiceRole.upsert({
          where: {
            guildId_channelId: {
              guildId: input.guildId,
              channelId: input.channelId,
            },
          },
          update: {
            categoryId: input.categoryId,
            roleId: input.roleId,
            graceSeconds: input.graceSeconds,
            enabled: true,
          },
          create: {
            guildId: input.guildId,
            channelId: input.channelId,
            categoryId: input.categoryId,
            roleId: input.roleId,
            graceSeconds: input.graceSeconds,
          },
        }),
      async deleteMapping(
        guildId: string,
        channelId: string,
      ): Promise<boolean> {
        await prisma.voiceRoleSession
          .deleteMany({ where: { guildId, channelId } })
          .catch(() => undefined);
        const result = await prisma.voiceRole.deleteMany({
          where: { guildId, channelId },
        });
        return result.count > 0;
      },
      async setEnabled(guildId: string, channelId: string, enabled: boolean) {
        const existing = await prisma.voiceRole.findUnique({
          where: { guildId_channelId: { guildId, channelId } },
        });
        if (!existing) return null;
        return prisma.voiceRole.update({
          where: { id: existing.id },
          data: { enabled },
        });
      },
      upsertSession: (input: VoiceSessionInput) =>
        prisma.voiceRoleSession.upsert({
          where: {
            guildId_userId_channelId_roleId: {
              guildId: input.guildId,
              userId: input.userId,
              channelId: input.channelId,
              roleId: input.roleId,
            },
          },
          update: {
            graceUntil: null,
            joinedAt: new Date(input.nowMs),
          },
          create: {
            guildId: input.guildId,
            userId: input.userId,
            channelId: input.channelId,
            roleId: input.roleId,
            joinedAt: new Date(input.nowMs),
          },
        }),
      findSessions: (guildId: string, userId: string, channelId: string) =>
        prisma.voiceRoleSession.findMany({
          where: { guildId, userId, channelId },
        }),
      listSessionsForUser: (guildId: string, userId: string) =>
        prisma.voiceRoleSession.findMany({
          where: { guildId, userId },
          orderBy: { joinedAt: "asc" },
        }),
      deleteSessionsForUser: (guildId: string, userId: string) =>
        prisma.voiceRoleSession.deleteMany({ where: { guildId, userId } }),
      markSessionGrace: (sessionId: string, graceUntil: Date) =>
        prisma.voiceRoleSession.update({
          where: { id: sessionId },
          data: { graceUntil },
        }),
      deleteSession: (sessionId: string) =>
        prisma.voiceRoleSession
          .delete({ where: { id: sessionId } })
          .catch(() => undefined),
      listExpiredSessions: (nowMs: number, limit: number) =>
        prisma.voiceRoleSession.findMany({
          where: { graceUntil: { not: null, lte: new Date(nowMs) } },
          orderBy: { graceUntil: "asc" },
          take: limit,
        }),
      deleteSessionsForChannel: (guildId: string, channelId: string) =>
        prisma.voiceRoleSession
          .deleteMany({ where: { guildId, channelId } })
          .catch(() => undefined),
    },
  };
}
