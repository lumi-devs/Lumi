import type { DbHelpers, PrismaClient } from "@lumi/db";

const TtlMs = 60_000;

export async function isGuildBlacklisted(
  prisma: PrismaClient,
  cache: DbHelpers["cache"],
  guildId: string | null | undefined,
): Promise<boolean> {
  if (!guildId) return false;
  return cache.getOrLoad(`blacklist:guild:${guildId}`, TtlMs, async () =>
    Boolean(await prisma.guildBlacklist.findUnique({ where: { guildId } })),
  ) as Promise<boolean>;
}

export async function isUserBlacklisted(
  prisma: PrismaClient,
  cache: DbHelpers["cache"],
  userId: string,
): Promise<boolean> {
  return cache.getOrLoad(`blacklist:user:${userId}`, TtlMs, async () =>
    Boolean(await prisma.userBlacklist.findUnique({ where: { userId } })),
  ) as Promise<boolean>;
}
