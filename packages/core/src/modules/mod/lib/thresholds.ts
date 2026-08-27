import type { Container } from "@sapphire/framework";
import { pipelineBySlot } from "#lib/database/cluster-safe.js";
import { tryParseJSON } from "@sapphire/utilities";
import { type WarnThresholdAction } from "@lumi/contracts";
import { parseDuration } from "#lib/utilities/time.js";
import {
  thresholdKey,
  invalidateThresholds,
  normalizeRuleDuration,
  setThresholdRule,
  removeThresholdRule,
} from "#utilities/thresholds.js";
import {
  BanAction,
  MuteAction,
  KickAction,
  QuarantineAction,
  VoiceMuteAction,
} from "../actions/index.js";

/** Kept identical to the wire contract so a rule the dashboard can save is a rule the runner can apply. */
export type ThresholdAction = WarnThresholdAction;
export { thresholdKey, invalidateThresholds, setThresholdRule, removeThresholdRule };

export interface ThresholdEntry {
  action: ThresholdAction;
  duration?: string;
}

export type WarnThresholds = Record<string, ThresholdEntry>;

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
      duration: normalizeRuleDuration(entry.action, entry.duration),
    }));

  await container.db.moderation.setBulkWarnThresholds(guildId, list);
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

const DECREMENT_WARN_COUNT_SCRIPT =
  "local v = tonumber(redis.call('GET', KEYS[1])); if v and v > 0 then return redis.call('DECR', KEYS[1]) end return v or 0";

export async function decrementWarnCount(
  container: Container,
  guildId: string,
  userId: string,
): Promise<void> {
  await container.redis.eval(DECREMENT_WARN_COUNT_SCRIPT, 1, warnCountKey(guildId, userId));
}

/** Batched variant of {@linkcode decrementWarnCount} - one pipeline instead of N round trips. */
export async function decrementWarnCounts(
  container: Container,
  entries: { guildId: string; userId: string }[],
): Promise<void> {
  if (entries.length === 0) return;
  await pipelineBySlot(
    container.redis,
    entries,
    ({ guildId, userId }) => warnCountKey(guildId, userId),
    (pipe, { guildId, userId }) => {
      pipe.eval(DECREMENT_WARN_COUNT_SCRIPT, 1, warnCountKey(guildId, userId));
    },
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

/**
 * Falls back to the hour both editors offer as their default rather than
 * dropping the rule: rows written before the write path validated durations
 * still describe an intended punishment, and a Discord timeout cannot be
 * permanent, so there is no "no duration" reading of the rule to honour.
 */
const FALLBACK_THRESHOLD_DURATION_MS = 60 * 60 * 1000;

function resolveThresholdDuration(
  container: Container,
  guildId: string,
  targetCount: number,
  entry: ThresholdEntry,
): number {
  const ms = entry.duration ? parseDuration(entry.duration) : null;
  if (ms) return ms;

  container.logger.warn(
    `[Thresholds] Guild ${guildId}: the ${entry.action} rule at ${targetCount} warns has an unusable duration (${
      entry.duration ? `"${entry.duration}"` : "none set"
    }) - applying ${FALLBACK_THRESHOLD_DURATION_MS / 60000}m instead. Save the rule again with a valid duration.`,
  );
  return FALLBACK_THRESHOLD_DURATION_MS;
}

export async function checkThresholds(
  container: Container,
  guildId: string,
  userId: string,
  warnCount: number,
): Promise<void> {
  const thresholds = await getThresholds(container, guildId);
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
    const ms = resolveThresholdDuration(container, guildId, targetCount, entry);
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
  } else if (entry.action === "quarantine") {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return;
    await QuarantineAction.apply({
      guild,
      targetMember: member,
      moderator: botUser,
      reason,
    }).catch((err) => {
      container.logger.error(
        `[Thresholds] Auto-quarantine failed for ${userId}:`,
        err,
      );
    });
  } else if (entry.action === "vcmute") {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return;
    const ms = resolveThresholdDuration(container, guildId, targetCount, entry);
    await VoiceMuteAction.apply({
      guild,
      targetMember: member,
      moderator: botUser,
      reason,
      durationMs: ms,
    }).catch((err) => {
      container.logger.error(
        `[Thresholds] Auto-voice-mute failed for ${userId}:`,
        err,
      );
    });
  } else {
    container.logger.error(
      `[Thresholds] Guild ${guildId} has a rule at ${targetCount} warns with unknown action "${entry.action as string}" - nothing was applied.`,
    );
  }
}
