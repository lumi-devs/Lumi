import type { Container } from "@sapphire/framework";
import { tryParseJSON } from "@sapphire/utilities";
import { parseDuration } from "#lib/utilities/time.js";
import { BanAction, MuteAction, KickAction } from "../actions/index.js";

export type ThresholdAction = "mute" | "kick" | "ban";

export interface ThresholdEntry {
  action: ThresholdAction;
  duration?: string;
}

export type WarnThresholds = Record<string, ThresholdEntry>;

export const thresholdKey = (guildId: string) =>
  `lumi:mod:${guildId}:thresholds`;
export const warnCountKey = (guildId: string, userId: string) =>
  `lumi:mod:${guildId}:warns:${userId}`;
const thresholdFiredKey = (guildId: string, userId: string, count: number) =>
  `lumi:mod:${guildId}:threshold-fired:${userId}:${count}`;

/** How long a fired threshold stays claimed - long enough to cover a retry storm. */
const THRESHOLD_FIRED_TTL = 60;

const THRESHOLD_TTL = 300;

export async function getThresholds(
  container: Container,
  guildId: string,
): Promise<WarnThresholds> {
  const cached = await container.redis.get(thresholdKey(guildId));
  if (cached) {
    const parsedCache = tryParseJSON(cached) as WarnThresholds | null;
    if (parsedCache) return parsedCache;
  }

  const rows = await container.db.moderation.getWarnThresholds(guildId);
  const parsed: WarnThresholds = {};
  for (const row of rows) {
    parsed[String(row.warnCount)] = {
      action: row.action as ThresholdAction,
      duration: row.duration ?? undefined,
    };
  }

  await container.redis.setex(
    thresholdKey(guildId),
    THRESHOLD_TTL,
    JSON.stringify(parsed),
  );
  return parsed;
}

export async function invalidateThresholds(
  container: Container,
  guildId: string,
): Promise<void> {
  if (container.invalidation) {
    await container.invalidation.invalidate(thresholdKey(guildId));
  } else {
    await container.redis.del(thresholdKey(guildId));
  }
}

export async function saveThresholds(
  container: Container,
  guildId: string,
  thresholds: WarnThresholds,
): Promise<void> {
  const list = Object.entries(thresholds)
    .map(([countStr, entry]) => ({ count: Number(countStr), entry }))
    .filter(({ count }) => !isNaN(count))
    .map(({ count, entry }) => ({
      warnCount: count,
      action: entry.action,
      duration: entry.duration,
    }));

  await container.db.moderation.setBulkWarnThresholds(guildId, list);
  await invalidateThresholds(container, guildId);
}

export async function setThresholdRule(
  container: Container,
  guildId: string,
  count: number,
  action: string,
  duration?: string,
): Promise<void> {
  await container.db.moderation.setWarnThreshold({
    guildId,
    warnCount: count,
    action,
    duration: duration || undefined,
  });
  await invalidateThresholds(container, guildId);
}

export async function removeThresholdRule(
  container: Container,
  guildId: string,
  count: number,
): Promise<void> {
  await container.db.moderation.removeWarnThreshold(guildId, count);
  await invalidateThresholds(container, guildId);
}

export async function resetAllThresholds(
  container: Container,
  guildId: string,
): Promise<void> {
  await container.db.moderation.resetWarnThresholds(guildId);
  await invalidateThresholds(container, guildId);
}

const WARN_COUNT_TTL = 365 * 24 * 3600;

export async function incrementWarnCount(
  container: Container,
  guildId: string,
  userId: string,
): Promise<number> {
  const key = warnCountKey(guildId, userId);
  const exists = await container.redis.exists(key);

  if (!exists) {
    const cases = await container.db.moderation.getModerationCases(
      guildId,
      userId,
      "warn",
    );
    await container.redis.set(key, String(cases.length), "EX", WARN_COUNT_TTL);
    return cases.length;
  }

  const pipe = container.redis.pipeline();
  pipe.incr(key);
  pipe.expire(key, WARN_COUNT_TTL);
  const results = await pipe.exec();
  if (!results || results[0]?.[0]) {
    container.logger.error("[Thresholds] Redis pipeline execution failed:", results?.[0]?.[0]);
    return 0;
  }
  return (results?.[0]?.[1] as number | null) ?? 0;
}

export async function decrementWarnCount(
  container: Container,
  guildId: string,
  userId: string,
): Promise<void> {
  await container.redis.eval(
    "local v = tonumber(redis.call('GET', KEYS[1])); if v and v > 0 then return redis.call('DECR', KEYS[1]) end return v or 0",
    1,
    warnCountKey(guildId, userId),
  );
}

export async function resetWarnCount(
  container: Container,
  guildId: string,
  userId: string,
): Promise<void> {
  if (container.invalidation) {
    await container.invalidation.invalidate(warnCountKey(guildId, userId));
  } else {
    await container.redis.del(warnCountKey(guildId, userId));
  }
}

export async function checkThresholds(
  container: Container,
  guildId: string,
  userId: string,
  warnCount: number,
): Promise<void> {
  const thresholds = await getThresholds(container, guildId);
  // Find highest threshold entry matching or below the target warn count
  const matchingKeys = Object.keys(thresholds)
    .map(Number)
    .filter((count) => count <= warnCount)
    .sort((a, b) => b - a);

  if (matchingKeys.length === 0) return;
  const targetCount = matchingKeys[0]!;
  const entry = thresholds[String(targetCount)];
  if (!entry) return;

  // Two warns landing at once can both resolve to the same threshold (and a
  // cold warn counter makes them resolve to the same count outright), which
  // would apply the punishment twice. First one through wins.
  const claimed = await container.redis.set(
    thresholdFiredKey(guildId, userId, targetCount),
    "1",
    "EX",
    THRESHOLD_FIRED_TTL,
    "NX",
  );
  if (claimed !== "OK") return;

  const guild = container.client.guilds.cache.get(guildId);
  if (!guild) return;

  const botUser = container.client.user;
  if (!botUser) return;
  const reason = `Auto: ${warnCount} warn${warnCount === 1 ? "" : "s"} reached threshold (${targetCount}).`;

  if (entry.action === "mute") {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return;
    const ms = entry.duration ? parseDuration(entry.duration) : null;
    if (!ms) return;
    await MuteAction.apply({
      guild,
      targetMember: member,
      moderator: botUser,
      reason,
      durationMs: ms,
    }).catch((err) => {
      container.logger.error(
        `[Thresholds] Auto-mute failed for ${userId}:`,
        err,
      );
    });
  } else if (entry.action === "kick") {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return;
    await KickAction.apply({
      guild,
      targetMember: member,
      moderator: botUser,
      reason,
    }).catch((err) => {
      container.logger.error(
        `[Thresholds] Auto-kick failed for ${userId}:`,
        err,
      );
    });
  } else if (entry.action === "ban") {
    const user = await container.client.users.fetch(userId).catch(() => null);
    if (!user) return;
    await BanAction.apply({
      guild,
      targetUser: user,
      moderator: botUser,
      reason,
    }).catch((err) => {
      container.logger.error(
        `[Thresholds] Auto-ban failed for ${userId}:`,
        err,
      );
    });
  }
}
