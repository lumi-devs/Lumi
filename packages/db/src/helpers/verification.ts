import type { DbContext } from "../context.js";

interface VerificationTokenModel {
  create(args: unknown): Promise<unknown>;
  findMany(args: unknown): Promise<unknown[]>;
  deleteMany(args: unknown): Promise<{ count: number }>;
}

export function createVerificationHelpers(ctx: DbContext) {
  const { prisma } = ctx;
  const db = prisma as unknown as {
    verificationToken?: Partial<VerificationTokenModel>;
  };
  const model = db.verificationToken;
  const available = Boolean(model?.create && model?.deleteMany);

  return {
    available,
    async createToken(data: {
      guildId: string;
      userId: string;
      tokenHash: string;
      expiresAt: Date;
    }) {
      if (!model?.create) {
        throw new Error("verification token store unavailable");
      }
      return model.create({ data });
    },
    async deleteExpiredTokens(before: Date) {
      if (!model?.deleteMany) return 0;
      const { count } = await model.deleteMany({
        where: { expiresAt: { lt: before } },
      });
      return count;
    },
    async listTokensForUser(guildId: string, userId: string) {
      if (!model?.findMany) return [];
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
      if (!model?.deleteMany) return 0;
      const { count } = await model.deleteMany({ where: { guildId, userId } });
      return count;
    },
  };
}
