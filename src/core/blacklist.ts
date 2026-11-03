import type { DbHelpers, PrismaClient } from "@lumi/db";

const TtlMs = 60_000;

function guildKey(guildId: string): string {
  return `blacklist:guild:${guildId}`;
}

function userKey(userId: string): string {
  return `blacklist:user:${userId}`;
}

export async function isGuildBlacklisted(
  prisma: PrismaClient,
  cache: DbHelpers["cache"],
  guildId: string | null | undefined,
): Promise<boolean> {
  if (!guildId) return false;
  return cache.getOrLoad(guildKey(guildId), TtlMs, async () =>
    Boolean(await prisma.guildBlacklist.findUnique({ where: { guildId } })),
  ) as Promise<boolean>;
}

export async function isUserBlacklisted(
  prisma: PrismaClient,
  cache: DbHelpers["cache"],
  userId: string,
): Promise<boolean> {
  return cache.getOrLoad(userKey(userId), TtlMs, async () =>
    Boolean(await prisma.userBlacklist.findUnique({ where: { userId } })),
  ) as Promise<boolean>;
}

export async function setGuildBlacklisted(
  prisma: PrismaClient,
  cache: DbHelpers["cache"],
  guildId: string,
  reason: string | null | undefined,
): Promise<void> {
  await prisma.guildBlacklist.upsert({
    where: { guildId },
    update: { reason },
    create: { guildId, reason },
  });
  await cache.del(guildKey(guildId));
}

export async function clearGuildBlacklisted(
  prisma: PrismaClient,
  cache: DbHelpers["cache"],
  guildId: string,
): Promise<void> {
  await prisma.guildBlacklist.deleteMany({ where: { guildId } });
  await cache.del(guildKey(guildId));
}

export async function setUserBlacklisted(
  prisma: PrismaClient,
  cache: DbHelpers["cache"],
  userId: string,
  reason: string | null | undefined,
): Promise<void> {
  await prisma.userBlacklist.upsert({
    where: { userId },
    update: { reason },
    create: { userId, reason },
  });
  await cache.del(userKey(userId));
}

export async function clearUserBlacklisted(
  prisma: PrismaClient,
  cache: DbHelpers["cache"],
  userId: string,
): Promise<void> {
  await prisma.userBlacklist.deleteMany({ where: { userId } });
  await cache.del(userKey(userId));
}
