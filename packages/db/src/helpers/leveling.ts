import type { DbContext } from "../context.js";

export interface LevelingXpInput {
  xp: number;
  totalXp: number;
  messageCount?: number;
  voiceMinutes?: number;
  lastXpAt?: Date;
}

export function createLevelingHelpers(ctx: DbContext) {
  const { prisma } = ctx;

  return {
    findUser: (guildId: string, userId: string) =>
      prisma.levelingUser.findUnique({
        where: { guildId_userId: { guildId, userId } },
      }),
    async addXp(guildId: string, userId: string, input: LevelingXpInput) {
      const user = await prisma.levelingUser.upsert({
        where: { guildId_userId: { guildId, userId } },
        update: {
          xp: { increment: input.xp },
          totalXp: { increment: input.totalXp },
          ...(input.messageCount
            ? { messageCount: { increment: input.messageCount } }
            : {}),
          ...(input.voiceMinutes
            ? { voiceMinutes: { increment: input.voiceMinutes } }
            : {}),
          ...(input.lastXpAt ? { lastXpAt: input.lastXpAt } : {}),
        },
        create: {
          guildId,
          userId,
          xp: input.xp,
          totalXp: input.totalXp,
          messageCount: input.messageCount ?? 0,
          voiceMinutes: input.voiceMinutes ?? 0,
          lastXpAt: input.lastXpAt ?? null,
        },
      });
      return user;
    },
    async setLevel(guildId: string, userId: string, level: number) {
      const user = await prisma.levelingUser.update({
        where: { guildId_userId: { guildId, userId } },
        data: { level },
      });
      return user;
    },
    async advanceLevel(
      guildId: string,
      userId: string,
      level: number,
    ): Promise<boolean> {
      const result = await prisma.levelingUser.updateMany({
        where: { guildId, userId, level: { lt: level } },
        data: { level },
      });
      return result.count > 0;
    },
    count: (guildId: string) =>
      prisma.levelingUser.count({ where: { guildId } }),
    rank: (guildId: string, totalXp: bigint) =>
      prisma.levelingUser.count({
        where: { guildId, totalXp: { gt: totalXp } },
      }),
    leaderboard: (
      guildId: string,
      orderBy: "xp" | "voiceMinutes",
      take: number,
      skip: number,
    ) =>
      prisma.levelingUser.findMany({
        where: { guildId },
        orderBy: { [orderBy]: "desc" },
        take,
        skip,
      }),
    async deleteUser(guildId: string, userId: string) {
      const result = await prisma.levelingUser.deleteMany({
        where: { guildId, userId },
      });
      return result.count;
    },
  };
}
