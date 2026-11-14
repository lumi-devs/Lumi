import type { DbContext } from "../context.js";

export function createVerificationHelpers(ctx: DbContext) {
  const model = ctx.prisma.verificationToken;

  return {
    available: true,
    async createToken(data: {
      guildId: string;
      userId: string;
      tokenHash: string;
      expiresAt: Date;
    }) {
      return model.create({ data });
    },
    async deleteExpiredTokens(before: Date) {
      const { count } = await model.deleteMany({
        where: { expiresAt: { lt: before } },
      });
      return count;
    },
    async listTokensForUser(guildId: string, userId: string) {
      return model.findMany({
        where: { guildId, userId },
        select: {
          id: true,
          guildId: true,
          userId: true,
          expiresAt: true,
          usedAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
      });
    },
    async deleteTokensForUser(guildId: string, userId: string) {
      const { count } = await model.deleteMany({ where: { guildId, userId } });
      return count;
    },
  };
}
