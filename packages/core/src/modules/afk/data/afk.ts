import { container } from "@sapphire/framework";
import { mgetSafe, pipelineBySlot, scanKeysSafe } from "#lib/database/cluster-safe.js";
import { isNullish, filterNullish, tryParseJSON } from "@sapphire/utilities";
import { AfkKeys, AfkTTL } from "../keys.js";
import { sanitizeReason } from "../index.js";
import type { AfkEntry } from "@prisma/client";

export interface AfkMention {
  authorId: string;
  authorName: string;
  channelId: string;
  messageId: string;
  ts: number;
}

function scanKeys(pattern: string) {
  return scanKeysSafe(container.redis, pattern);
}

async function invalidateKeys(keys: string[]) {
  await container.invalidation.invalidate(...keys);
}

async function getOrSet<T>(
  key: string,
  ttl: number,
  fetcher: () => Promise<T>,
  parser: (data: string) => T,
): Promise<T> {
  const cached = await container.redis.get(key);
  if (cached) return parser(cached);

  const data = await fetcher();
  if (!isNullish(data)) {
    await container.redis.setex(key, ttl, JSON.stringify(data));
  }
  return data;
}

export async function getAfkEntry(
  guildId: string,
  userId: string,
): Promise<AfkEntry | null> {
  return getOrSet(
    AfkKeys.afk(guildId, userId),
    AfkTTL.entry,
    () => container.db.afk.findEntry(guildId, userId),
    (data: string) => {
      const parsed = tryParseJSON(data) as AfkEntry | null;
      if (!parsed) return null;
      return { ...parsed, since: new Date(parsed.since) };
    },
  );
}

export async function getAfkEntriesBatch(
  guildId: string,
  userIds: string[],
): Promise<Map<string, AfkEntry>> {
  const result = new Map<string, AfkEntry>();
  if (userIds.length === 0) return result;

  const keys = userIds.map((userId) => AfkKeys.afk(guildId, userId));
  const rawValues = await mgetSafe(container.redis, keys);

  const missingUserIds: string[] = [];
  rawValues.forEach((raw, i) => {
    const userId = userIds[i]!;
    if (raw) {
      const parsed = tryParseJSON(raw) as AfkEntry | null;
      if (parsed) {
        result.set(userId, { ...parsed, since: new Date(parsed.since) });
        return;
      }
    }
    missingUserIds.push(userId);
  });

  if (missingUserIds.length > 0) {
    const dbEntries = await container.db.afk.findEntries(guildId, missingUserIds);
    for (const entry of dbEntries) {
      result.set(entry.userId, entry);
      void container.redis.setex(
        AfkKeys.afk(guildId, entry.userId),
        AfkTTL.entry,
        JSON.stringify(entry),
      );
    }
  }

  return result;
}

export async function setAfkEntry(
  guildId: string,
  userId: string,
  reason: string,
): Promise<AfkEntry> {
  const entry = await container.db.afk.upsertEntry(
    guildId,
    userId,
    sanitizeReason(reason),
  );
  await container.redis.setex(
    AfkKeys.afk(guildId, userId),
    AfkTTL.entry,
    JSON.stringify(entry),
  );
  return entry;
}

export async function clearAfkEntry(
  guildId: string,
  userId: string,
): Promise<boolean> {
  try {
    await container.db.afk.deleteEntry(guildId, userId);
    await invalidateKeys([AfkKeys.afk(guildId, userId)]);
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
  const count = await container.db.afk.deleteAllForUser(userId);
  const keys = await scanKeys(AfkKeys.allForUserPattern(userId));
  if (keys.length) {
    await invalidateKeys(keys);
  }
  return count;
}

export function iterateAllAfkEntries(): AsyncGenerator<AfkEntry[]> {
  return container.db.afk.iterateAll();
}

export function getAfkEntriesForGuild(guildId: string): Promise<AfkEntry[]> {
  return container.db.afk.findForGuild(guildId);
}

export async function getAfkStats(): Promise<{
  activeEntries: number;
  activeCooldowns: number;
}> {
  const activeEntries = await container.db.afk.countAll();
  const keys = await scanKeys(AfkKeys.removalCooldownPattern());
  return { activeEntries, activeCooldowns: keys.length };
}

export async function getAfkMentions(
  guildId: string,
  userId: string,
): Promise<AfkMention[]> {
  const raw = await container.redis.lrange(
    AfkKeys.mentions(guildId, userId),
    0,
    -1,
  );
  return raw
    .map((i) => tryParseJSON(i) as AfkMention | null)
    .filter(filterNullish);
}

export async function addAfkMention(
  guildId: string,
  userId: string,
  mention: AfkMention,
): Promise<void> {
  const key = AfkKeys.mentions(guildId, userId);
  await container.redis
    .multi()
    .lpush(key, JSON.stringify(mention))
    .ltrim(key, 0, 24)
    .expire(key, AfkTTL.mentions)
    .exec();
}

export async function clearAfkMentions(
  guildId: string,
  userId: string,
): Promise<void> {
  await container.invalidation.invalidate(AfkKeys.mentions(guildId, userId));
}

export async function isAfkOnCooldown(key: string): Promise<boolean> {
  return (await container.redis.exists(key)) === 1;
}

export async function setAfkCooldown(key: string, ms: number): Promise<void> {
  await container.redis.set(key, "1", "PX", ms);
}

/**
 * Atomically take a cooldown slot. Returns true only for the caller that won
 * it - `isAfkOnCooldown` followed by `setAfkCooldown` leaves a window in which
 * two messages from the same author both pass the check.
 */
export async function claimAfkCooldown(
  key: string,
  ms: number,
): Promise<boolean> {
  const set = await container.redis.set(key, "1", "PX", ms, "NX");
  return set === "OK";
}

/**
 * Batch-writes multiple AFK mentions for different users in a single Redis
 * multi/exec transaction instead of one round-trip per mentioned user.
 */
export async function addAfkMentionsBatch(
  guildId: string,
  mentions: { userId: string; mention: AfkMention }[],
): Promise<void> {
  if (!mentions.length) return;
  await pipelineBySlot(
    container.redis,
    mentions,
    ({ userId }) => AfkKeys.mentions(guildId, userId),
    (pipe, { userId, mention }) => {
      const key = AfkKeys.mentions(guildId, userId);
      pipe
        .lpush(key, JSON.stringify(mention))
        .ltrim(key, 0, 24)
        .expire(key, AfkTTL.mentions);
    },
  );
}
