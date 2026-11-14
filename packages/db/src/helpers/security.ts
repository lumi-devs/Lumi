import type { Prisma } from "@prisma/client";
import type { DbContext } from "../context.js";

export function createSecurityHelpers(ctx: DbContext) {
  const model = ctx.prisma.securityBackup;

  return {
    available: true,
    async createBackup(args: {
      guildId: string;
      reason: string;
      data: unknown;
    }) {
      return model.create({
        data: {
          guildId: args.guildId,
          reason: args.reason,
          data: args.data as Prisma.InputJsonValue,
        },
      });
    },
    async latestBackup(guildId: string) {
      return model.findFirst({
        where: { guildId },
        orderBy: { createdAt: "desc" },
      });
    },
    async backupById(guildId: string, backupId: string) {
      return model.findFirst({
        where: { id: backupId, guildId },
      });
    },
    async listBackups(guildId: string, take = 10) {
      return model.findMany({
        where: { guildId },
        orderBy: { createdAt: "desc" },
        take,
      });
    },
    async pruneBackups(guildId: string, keepCount: number) {
      const keep = await model.findMany({
        where: { guildId },
        orderBy: { createdAt: "desc" },
        take: keepCount,
        select: { id: true },
      });
      const result = await model.deleteMany({
        where: { guildId, id: { notIn: keep.map((entry) => entry.id) } },
      });
      return result.count;
    },
  };
}
