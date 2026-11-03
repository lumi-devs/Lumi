import type { Prisma } from "@prisma/client";
import type { DbContext } from "../context.js";

interface SecurityBackupModel {
  create(args: unknown): Promise<unknown>;
  findFirst(args: unknown): Promise<unknown>;
  findMany(args: unknown): Promise<unknown[]>;
  deleteMany(args: unknown): Promise<{ count: number }>;
}

export function createSecurityHelpers(ctx: DbContext) {
  const { prisma } = ctx;
  const db = prisma as unknown as {
    securityBackup?: SecurityBackupModel;
  };
  const model = db.securityBackup;

  return {
    available: Boolean(model),
    async createBackup(args: {
      guildId: string;
      reason: string;
      data: unknown;
    }) {
      if (!model) return null;
      return model.create({
        data: {
          guildId: args.guildId,
          reason: args.reason,
          data: args.data as Prisma.InputJsonValue,
        },
      });
    },
    async latestBackup(guildId: string) {
      if (!model) return null;
      return model.findFirst({
        where: { guildId },
        orderBy: { createdAt: "desc" },
      });
    },
    async backupById(guildId: string, backupId: string) {
      if (!model) return null;
      return model.findFirst({
        where: { id: backupId, guildId },
      });
    },
    async listBackups(guildId: string, take = 10) {
      if (!model) return [];
      return model.findMany({
        where: { guildId },
        orderBy: { createdAt: "desc" },
        take,
      });
    },
    async pruneBackups(guildId: string, keepCount: number) {
      if (!model) return 0;
      const keep = await model.findMany({
        where: { guildId },
        orderBy: { createdAt: "desc" },
        take: keepCount,
        select: { id: true },
      });
      const keepIds = (keep as Array<{ id: string }>).map((entry) => entry.id);
      const result = await model.deleteMany({
        where: { guildId, id: { notIn: keepIds } },
      });
      return result.count;
    },
  };
}
