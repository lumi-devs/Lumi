import type { Container } from "#src/lib/Services.js";
import { claimCooldown, isOnCooldown } from "#src/lib/cache/Cooldown.js";
import { cacheStore } from "#src/lib/cache/CacheStore.js";
import { AfkKeys, AfkTTL } from "#src/modules/afk/Constants.js";
import { sanitizeReason } from "#src/modules/afk/services/Format.js";
import type { AfkEntry } from "@prisma/client";

interface AfkMention {
  authorId: string;
  authorName: string;
  channelId: string;
  messageId: string;
  ts: number;
}

const mentionsStore = new Map<string, AfkMention[]>();

export async function getAfkEntry(
  services: Container,
  guildId: string,
  userId: string,
): Promise<AfkEntry | null> {
  const key = AfkKeys.afk(guildId, userId);
  return cacheStore.getOrLoad(key, AfkTTL.entry * 1000, () =>
    services.db.afk.findEntry(guildId, userId),
  );
}

export async function getAfkEntriesBatch(
  services: Container,
  guildId: string,
  userIds: string[],
): Promise<Map<string, AfkEntry>> {
  const result = new Map<string, AfkEntry>();
  if (userIds.length === 0) return result;

  const missingUserIds: string[] = [];
  for (const uid of userIds) {
    const cached = cacheStore.get<AfkEntry>(AfkKeys.afk(guildId, uid));
    if (cached) {
      result.set(uid, cached);
    } else {
      missingUserIds.push(uid);
    }
  }

  if (missingUserIds.length > 0) {
    const dbEntries = await services.db.afk.findEntries(guildId, missingUserIds);
    for (const entry of dbEntries) {
      result.set(entry.userId, entry);
      cacheStore.set(AfkKeys.afk(guildId, entry.userId), entry, AfkTTL.entry * 1000);
    }
  }

  return result;
}

export async function setAfkEntry(
  services: Container,
  guildId: string,
  userId: string,
  reason: string,
): Promise<AfkEntry> {
  const entry = await services.db.afk.upsertEntry(
    guildId,
    userId,
    sanitizeReason(reason),
  );
  cacheStore.set(AfkKeys.afk(guildId, userId), entry, AfkTTL.entry * 1000);
  return entry;
}

export async function clearAfkEntry(
  services: Container,
  guildId: string,
  userId: string,
): Promise<boolean> {
  try {
    await services.db.afk.deleteEntry(guildId, userId);
    cacheStore.delete(AfkKeys.afk(guildId, userId));
    return true;
  } catch (err: unknown) {
    services.logger.error(`[AFK] Failed to clear AFK for ${userId} in ${guildId}:`, err);
    return false;
  }
}

export async function clearAllAfkForUser(
  services: Container,
  userId: string,
): Promise<number> {
  const count = await services.db.afk.deleteAllForUser(userId);
  cacheStore.clear();
  return count;
}

export function iterateAllAfkEntries(
  services: Container,
): AsyncGenerator<AfkEntry[]> {
  return services.db.afk.iterateAll();
}

export function getAfkEntriesForGuild(
  services: Container,
  guildId: string,
): Promise<AfkEntry[]> {
  return services.db.afk.findForGuild(guildId);
}

export async function getAfkStatsForGuild(
  services: Container,
  guildId: string,
): Promise<{ activeEntries: number; activeCooldowns: number }> {
  const activeEntries = await services.db.afk.countForGuild(guildId);
  return { activeEntries, activeCooldowns: 0 };
}

export async function getAfkMentions(
  _services: Container,
  guildId: string,
  userId: string,
): Promise<AfkMention[]> {
  const key = AfkKeys.mentions(guildId, userId);
  return mentionsStore.get(key) ?? [];
}

export async function addAfkMention(
  _services: Container,
  guildId: string,
  userId: string,
  mention: AfkMention,
): Promise<void> {
  const key = AfkKeys.mentions(guildId, userId);
  const current = mentionsStore.get(key) ?? [];
  current.unshift(mention);
  if (current.length > 25) current.length = 25;
  mentionsStore.set(key, current);
}

export async function clearAfkMentions(
  _services: Container,
  guildId: string,
  userId: string,
): Promise<void> {
  const key = AfkKeys.mentions(guildId, userId);
  mentionsStore.delete(key);
}

export async function isAfkOnCooldown(
  _services: Container,
  key: string,
): Promise<boolean> {
  return isOnCooldown(key);
}

export async function setAfkCooldown(
  _services: Container,
  key: string,
  ms: number,
): Promise<void> {
  claimCooldown(key, ms);
}

export async function claimAfkCooldown(
  _services: Container,
  key: string,
  ms: number,
): Promise<boolean> {
  return claimCooldown(key, ms);
}

export async function addAfkMentionsBatch(
  services: Container,
  guildId: string,
  mentions: { userId: string; mention: AfkMention }[],
): Promise<void> {
  for (const { userId, mention } of mentions) {
    await addAfkMention(services, guildId, userId, mention);
  }
}
