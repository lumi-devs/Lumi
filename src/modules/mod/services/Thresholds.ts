import type { Container } from "#src/lib/Services.js";
import { createMemberBatcher } from "#src/lib/client/MemberBatcher.js";
import type { Guild, GuildMember } from "discord.js";
import {pipelineBySlot} from "#src/lib/valkey/Cluster.js";
import { tryParseJSON } from "#src/shared/Index.ts";
import { type WarnThresholdAction } from "#src/contracts/rpc/Index.ts";
import { Time } from "#src/shared/Index.ts";
import { thresholdKey } from "#src/modules/mod/data/ThresholdRules.js";
import { BanAction } from "#src/modules/mod/services/actions/BanAction.js";
import { MuteAction } from "#src/modules/mod/services/actions/MuteAction.js";
import { KickAction } from "#src/modules/mod/services/actions/KickAction.js";
import { QuarantineAction } from "#src/lib/moderation/Quarantine.js";
import { VoiceMuteAction } from "#src/modules/mod/services/actions/VoiceMuteAction.js";
import { isImmuneToAutomatedAction } from "#src/lib/moderation/Immunity.js";

type ThresholdAction = WarnThresholdAction;

interface ThresholdEntry {
  action: ThresholdAction;

  duration?: number | undefined;
}

export type WarnThresholds = Record<string, ThresholdEntry>;

const warnCountKey = (guildId: string, userId: string) =>
  `lumi:mod:${guildId}:warns:${userId}`;
const thresholdFiredKey = (guildId: string, userId: string, count: number) =>
  `lumi:mod:${guildId}:threshold-fired:${userId}:${count}`;

const ThresholdFiredTtl = 60;

const ThresholdTtl = 300;

const memberBatchers = new Map<
  string,
  { guild: Guild; fetch: (userId: string) => Promise<GuildMember | null> }
>();

function batcherFor(guild: Guild): (userId: string) => Promise<GuildMember | null> {
  const entry = memberBatchers.get(guild.id);
  if (entry && entry.guild === guild) return entry.fetch;
  const fetch = createMemberBatcher(guild);
  memberBatchers.set(guild.id, { guild, fetch });
  return fetch;
}

async function actionableMember(
  container: Container,
  guild: Guild,
  guildId: string,
  userId: string,
): Promise<GuildMember | null> {
  const member = await batcherFor(guild)(userId).catch(() => null);
  if (!member) return null;
  if (await isImmuneToAutomatedAction(container, guildId, member)) return null;
  return member;
}

export async function getThresholds(
  container: Container,
  guildId: string,
): Promise<WarnThresholds> {
  const cached = await container.valkey.get(thresholdKey(guildId));
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

  await container.valkey.setex(
    thresholdKey(guildId),
    ThresholdTtl,
    JSON.stringify(parsed),
  );
  return parsed;
}

const WarnCountTtl = 365 * 24 * 3600;

export async function incrementWarnCount(
  container: Container,
  guildId: string,
  userId: string,
): Promise<number> {
  const key = warnCountKey(guildId, userId);
  const exists = await container.valkey.exists(key);

  if (!exists) {
    const count = await container.db.moderation.countModerationCases(
      guildId,
      userId,
      "warn",
    );
    await container.valkey.set(key, String(count), "EX", WarnCountTtl);
    return count;
  }

  const pipe = container.valkey.pipeline();
  pipe.incr(key);
  pipe.expire(key, WarnCountTtl);
  const results = await pipe.exec();
  if (!results || results[0]?.[0]) {
    container.logger.error("[Thresholds] Valkey pipeline execution failed:", results?.[0]?.[0]);
    return 0;
  }
  return (results?.[0]?.[1] as number | null) ?? 0;
}

const DecrementWarnCountScript =
  "local v = tonumber(redis.call('GET', KEYS[1])); if v and v > 0 then return redis.call('DECR', KEYS[1]) end return v or 0";

export async function decrementWarnCount(
  container: Container,
  guildId: string,
  userId: string,
): Promise<void> {
  await container.valkey.eval(DecrementWarnCountScript, 1, warnCountKey(guildId, userId));
}

export async function decrementWarnCounts(
  container: Container,
  entries: { guildId: string; userId: string }[],
): Promise<void> {
  if (entries.length === 0) return;
  await pipelineBySlot(
    container.valkey,
    entries,
    ({ guildId, userId }) => warnCountKey(guildId, userId),
    (pipe, { guildId, userId }) => {
      pipe.eval(DecrementWarnCountScript, 1, warnCountKey(guildId, userId));
    },
  );
}

export async function resetWarnCount(
  container: Container,
  guildId: string,
  userId: string,
): Promise<void> {
  await container.invalidation.invalidate(warnCountKey(guildId, userId));
}

const FallbackThresholdDurationMs = Time.Hour;

function resolveThresholdDuration(
  container: Container,
  guildId: string,
  targetCount: number,
  entry: ThresholdEntry,
): number {
  const ms = entry.duration ? entry.duration * 1000 : null;
  if (ms) return ms;

  container.logger.warn(
    `[Thresholds] Guild ${guildId}: the ${entry.action} rule at ${targetCount} warns has an unusable duration (${
      entry.duration ? `"${entry.duration}"` : "none set"
    }) - applying ${FallbackThresholdDurationMs / Time.Minute}m instead. Save the rule again with a valid duration.`,
  );
  return FallbackThresholdDurationMs;
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

  const guild = container.client.guilds.cache.get(guildId);
  if (!guild) return;

  const botUser = container.client.user;
  if (!botUser) return;

  const claimed = await container.valkey.set(
    thresholdFiredKey(guildId, userId, targetCount),
    "1",
    "EX",
    ThresholdFiredTtl,
    "NX",
  );
  if (claimed !== "OK") return;

  const reason = `Auto: ${warnCount} warn${warnCount === 1 ? "" : "s"} reached threshold (${targetCount}).`;

  if (entry.action === "mute") {
    const member = await actionableMember(container, guild, guildId, userId);
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
    const member = await actionableMember(container, guild, guildId, userId);
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
    const member = await batcherFor(guild)(userId).catch(() => null);
    const user =
      member?.user ??
      (await container.client.users.fetch(userId).catch(() => null));
    if (!user) return;
    if (member && (await isImmuneToAutomatedAction(container, guildId, member)))
      return;
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
    const member = await actionableMember(container, guild, guildId, userId);
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
  } else if (entry.action === "voice_mute") {
    const member = await actionableMember(container, guild, guildId, userId);
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
