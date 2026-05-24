import { container } from "@sapphire/framework";
import { RedisKeys, RedisTTL } from "#database/redis.js";
import { sanitizeReason } from "../index.js";
import type { AfkEntry } from "@prisma/client";

export interface AfkMention {
  authorId: string;
  authorName: string;
  channelId: string;
  messageId: string;
  ts: number;
}

async function scanKeys(pattern: string) {
  let cursor = "0";
  const found: string[] = [];
  do {
    const [next, keys] = await container.redis.scan(
      cursor,
      "MATCH",
      pattern,
      "COUNT",
      100,
    );
    cursor = next;
    found.push(...keys);
  } while (cursor !== "0");
  return found;
}

async function getOrSet<T>(
  key: string,
  ttl: number,
  fetcher: () => Promise<T>,
  parser: (data: string) => T = JSON.parse,
): Promise<T> {
  const cached = await container.redis.get(key);
  if (cached) return parser(cached);

  const data = await fetcher();
  if (data !== null && data !== undefined) {
    await container.redis.setex(key, ttl, JSON.stringify(data));
  }
  return data;
}

export async function getAfkEntry(
  guildId: string,
  userId: string,
): Promise<AfkEntry | null> {
  return getOrSet(
    RedisKeys.afk(guildId, userId),
    RedisTTL.afkEntry,
    async () => {
      const entry = await container.prisma.afkEntry.findUnique({
        where: { userId_guildId: { userId, guildId } },
      });
      return entry;
    },
    (data: string) => {
      const parsed = JSON.parse(data);
      if (!parsed) return null;
      return { ...parsed, since: new Date(parsed.since) };
    },
  );
}

export async function setAfkEntry(
  guildId: string,
  userId: string,
  reason: string,
): Promise<AfkEntry> {
  const entry = await container.prisma.afkEntry.upsert({
    where: { userId_guildId: { userId, guildId } },
    update: { reason: sanitizeReason(reason), since: new Date() },
    create: { userId, guildId, reason: sanitizeReason(reason) },
  });
  await container.redis.setex(
    RedisKeys.afk(guildId, userId),
    RedisTTL.afkEntry,
    JSON.stringify(entry),
  );
  return entry;
}

export async function clearAfkEntry(
  guildId: string,
  userId: string,
): Promise<boolean> {
  try {
    await container.prisma.afkEntry.delete({
      where: { userId_guildId: { userId, guildId } },
    });
    await container.redis.del(RedisKeys.afk(guildId, userId));
    return true;
  } catch (err: unknown) {
    container.logger.error(
      `[AFK] Failed to clear AFK for ${userId} in ${guildId}:`,
      err,
    );
    return false;
  }
}

export async function clearAllAfkForUser(userId: string): Promise<number> {
  const { count } = await container.prisma.afkEntry.deleteMany({
    where: { userId },
  });
  const keys = await scanKeys(RedisKeys.afkAllForUserPattern(userId));
  if (keys.length) await container.redis.del(...keys);
  return count;
}

export async function getAllAfkEntries(): Promise<AfkEntry[]> {
  return container.prisma.afkEntry.findMany();
}

export async function getAfkEntriesForGuild(
  guildId: string,
): Promise<AfkEntry[]> {
  return container.prisma.afkEntry.findMany({ where: { guildId } });
}

export async function getAfkStats(): Promise<{
  activeEntries: number;
  activeCooldowns: number;
}> {
  const activeEntries = await container.prisma.afkEntry.count();
  const keys = await scanKeys(RedisKeys.afkRemovalCooldownPattern());
  return { activeEntries, activeCooldowns: keys.length };
}

export async function getAfkMentions(
  guildId: string,
  userId: string,
): Promise<AfkMention[]> {
  const raw = await container.redis.lrange(
    RedisKeys.afkMentions(guildId, userId),
    0,
    -1,
  );
  return raw.map((i) => JSON.parse(i)).filter(Boolean);
}

export async function addAfkMention(
  guildId: string,
  userId: string,
  mention: AfkMention,
): Promise<void> {
  const key = RedisKeys.afkMentions(guildId, userId);
  await container.redis
    .multi()
    .lpush(key, JSON.stringify(mention))
    .ltrim(key, 0, 24)
    .expire(key, RedisTTL.afkMentions)
    .exec();
}

export async function clearAfkMentions(
  guildId: string,
  userId: string,
): Promise<void> {
  await container.redis.del(RedisKeys.afkMentions(guildId, userId));
}

export async function isAfkOnCooldown(key: string): Promise<boolean> {
  return (await container.redis.exists(key)) === 1;
}

export async function setAfkCooldown(key: string, ms: number): Promise<void> {
  await container.redis.set(key, "1", "PX", ms);
}
