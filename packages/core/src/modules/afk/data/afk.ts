import type { Container } from "@lumi/lib/services.js";
import { mgetSafe, pipelineBySlot, scanKeysSafe } from "@lumi/infrastructure/database";
import { claimCooldown, isOnCooldown } from "@lumi/lib/valkey/cooldown.js";
import { isNullish, filterNullish, tryParseJSON } from "@lumi/shared";
import { AfkKeys, AfkTTL } from "../constants.js";
import { sanitizeReason } from "@lumi/application/services/afk/format.js";
import type { AfkEntry } from "@prisma/client";

interface AfkMention {
  authorId: string;
  authorName: string;
  channelId: string;
  messageId: string;
  ts: number;
}

function scanKeys(services: Container, pattern: string) {
  return scanKeysSafe(services.valkey, pattern);
}

async function invalidateKeys(services: Container, keys: string[]) {
  await services.invalidation.invalidate(...keys);
}

const inflight = new Map<string, Promise<unknown>>();
// Process-local by design: every mutation for a guild runs on its owning shard.
const negativeUntil = new Map<string, number>();
const NegativeTtlMs = 15_000;

async function getOrSet<T>(
  services: Container,
  key: string,
  ttl: number,
  fetcher: () => Promise<T>,
  parser: (data: string) => T,
): Promise<T> {
  const neg = negativeUntil.get(key);
  if (neg !== undefined && neg > Date.now()) return null as T;
  const cached = await services.valkey.get(key);
  if (cached) return parser(cached);

  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;
  const run = (async () => {
    const data = await fetcher();
    if (isNullish(data)) {
      if (negativeUntil.size > 5000) negativeUntil.clear();
      negativeUntil.set(key, Date.now() + NegativeTtlMs);
    } else {
      negativeUntil.delete(key);
      await services.valkey.setex(key, ttl, JSON.stringify(data));
    }
    return data;
  })();
  inflight.set(key, run);
  try {
    return await run;
  } finally {
    inflight.delete(key);
  }
}

export async function getAfkEntry(
  services: Container,
  guildId: string,
  userId: string,
): Promise<AfkEntry | null> {
  return getOrSet(
    services,
    AfkKeys.afk(guildId, userId),
    AfkTTL.entry,
    () => services.db.afk.findEntry(guildId, userId),
    (data: string) => {
      const parsed = tryParseJSON(data) as AfkEntry | null;
      if (!parsed) return null;
      return { ...parsed, since: new Date(parsed.since) };
    },
  );
}

export async function getAfkEntriesBatch(
  services: Container,
  guildId: string,
  userIds: string[],
): Promise<Map<string, AfkEntry>> {
  const result = new Map<string, AfkEntry>();
  if (userIds.length === 0) return result;

  const now = Date.now();
  const keys = userIds.map((userId) => AfkKeys.afk(guildId, userId));
  const rawValues = await mgetSafe(services.valkey, keys);

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
    const neg = negativeUntil.get(keys[i]!);
    if (neg === undefined || neg <= now) missingUserIds.push(userId);
  });

  if (missingUserIds.length > 0) {
    const dbEntries = await services.db.afk.findEntries(guildId, missingUserIds);
    const found = new Set<string>();
    for (const entry of dbEntries) {
      result.set(entry.userId, entry);
      found.add(entry.userId);
    }
    if (negativeUntil.size > 5000) negativeUntil.clear();
    for (const userId of missingUserIds) {
      if (!found.has(userId)) {
        negativeUntil.set(AfkKeys.afk(guildId, userId), now + NegativeTtlMs);
      }
    }
    await pipelineBySlot(
      services.valkey,
      dbEntries,
      (entry) => AfkKeys.afk(guildId, entry.userId),
      (pipe, entry) => {
        pipe.setex(
          AfkKeys.afk(guildId, entry.userId),
          AfkTTL.entry,
          JSON.stringify(entry),
        );
      },
    );
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
  negativeUntil.delete(AfkKeys.afk(guildId, userId));
  await services.valkey.setex(
    AfkKeys.afk(guildId, userId),
    AfkTTL.entry,
    JSON.stringify(entry),
  );
  return entry;
}

export async function clearAfkEntry(
  services: Container,
  guildId: string,
  userId: string,
): Promise<boolean> {
  try {
    await services.db.afk.deleteEntry(guildId, userId);
    negativeUntil.delete(AfkKeys.afk(guildId, userId));
    await invalidateKeys(services, [AfkKeys.afk(guildId, userId)]);
    return true;
  } catch (err: unknown) {
    services.logger.error(
      `[AFK] Failed to clear AFK for ${userId} in ${guildId}:`,
      err,
    );
    return false;
  }
}

export async function clearAllAfkForUser(
  services: Container,
  userId: string,
): Promise<number> {
  const count = await services.db.afk.deleteAllForUser(userId);
  const keys = await scanKeys(services, AfkKeys.allForUserPattern(userId));
  if (keys.length) {
    await invalidateKeys(services, keys);
  }
  for (const key of negativeUntil.keys()) {
    if (key.endsWith(`:${userId}`)) negativeUntil.delete(key);
  }
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

export async function getAfkStats(services: Container): Promise<{
  activeEntries: number;
  activeCooldowns: number;
}> {
  const activeEntries = await services.db.afk.countAll();
  const keys = await scanKeys(services, AfkKeys.removalCooldownPattern());
  return { activeEntries, activeCooldowns: keys.length };
}

export async function getAfkMentions(
  services: Container,
  guildId: string,
  userId: string,
): Promise<AfkMention[]> {
  const raw = await services.valkey.lrange(
    AfkKeys.mentions(guildId, userId),
    0,
    -1,
  );
  return raw
    .map((i) => tryParseJSON(i) as AfkMention | null)
    .filter(filterNullish);
}

export async function addAfkMention(
  services: Container,
  guildId: string,
  userId: string,
  mention: AfkMention,
): Promise<void> {
  const key = AfkKeys.mentions(guildId, userId);
  await services.valkey
    .multi()
    .lpush(key, JSON.stringify(mention))
    .ltrim(key, 0, 24)
    .expire(key, AfkTTL.mentions)
    .exec();
}

export async function clearAfkMentions(
  services: Container,
  guildId: string,
  userId: string,
): Promise<void> {
  await services.invalidation.invalidate(AfkKeys.mentions(guildId, userId));
}

export async function isAfkOnCooldown(
  services: Container,
  key: string,
): Promise<boolean> {
  return isOnCooldown(services, key);
}

export async function setAfkCooldown(
  services: Container,
  key: string,
  ms: number,
): Promise<void> {
  await services.valkey.set(key, "1", "PX", ms);
}

/**
 * Atomically take a cooldown slot. Returns true only for the caller that won
 * it - `isAfkOnCooldown` followed by `setAfkCooldown` leaves a window in which
 * two messages from the same author both pass the check.
 */
export async function claimAfkCooldown(
  services: Container,
  key: string,
  ms: number,
): Promise<boolean> {
  return claimCooldown(services, key, ms);
}

/**
 * Batch-writes multiple AFK mentions for different users in a single Valkey
 * multi/exec transaction instead of one round-trip per mentioned user.
 */
export async function addAfkMentionsBatch(
  services: Container,
  guildId: string,
  mentions: { userId: string; mention: AfkMention }[],
): Promise<void> {
  if (!mentions.length) return;
  await pipelineBySlot(
    services.valkey,
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
