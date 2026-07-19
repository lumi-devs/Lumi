import type { Container } from "@sapphire/framework";
import { tryParseJSON } from "@sapphire/utilities";
import { parseDuration } from "./helpers.js";
import { BanAction, MuteAction, KickAction } from "./actions/index.js";

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

  const raw = await container.db.config.getModuleConfig(
    guildId,
    "mod",
    "warn_thresholds",
  );
  const parsed: WarnThresholds =
    raw && typeof raw === "string"
      ? ((tryParseJSON(raw) as WarnThresholds | null) ?? {})
      : {};

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
  await container.redis.del(thresholdKey(guildId));
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
  await container.redis.del(warnCountKey(guildId, userId));
}

export async function checkThresholds(
  container: Container,
  guildId: string,
  userId: string,
  warnCount: number,
): Promise<void> {
  const thresholds = await getThresholds(container, guildId);
  const entry = thresholds[String(warnCount)];
  if (!entry) return;

  const guild = container.client.guilds.cache.get(guildId);
  if (!guild) return;

  const botUser = container.client.user;
  if (!botUser) return;
  const reason = `Auto: ${warnCount} warn${warnCount === 1 ? "" : "s"} reached threshold.`;

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
