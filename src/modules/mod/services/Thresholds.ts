import type { Container } from "#src/lib/Services.js";
import { createMemberBatcher } from "#src/lib/client/MemberBatcher.js";
import type { Guild, GuildMember } from "discord.js";
import { type WarnThresholdAction } from "#src/contracts/rpc/Index.ts";
import { Time } from "#src/shared/Index.ts";
import { BanAction } from "#src/modules/mod/services/actions/BanAction.js";
import { MuteAction } from "#src/modules/mod/services/actions/MuteAction.js";
import { KickAction } from "#src/modules/mod/services/actions/KickAction.js";
import { QuarantineAction } from "#src/lib/api/moderation/Quarantine.js";
import { VoiceMuteAction } from "#src/modules/mod/services/actions/VoiceMuteAction.js";
import { isImmuneToAutomatedAction } from "#src/lib/api/moderation/Immunity.js";

type ThresholdAction = WarnThresholdAction;

interface ThresholdEntry {
  action: ThresholdAction;

  duration?: number | undefined;
}

export type WarnThresholds = Record<string, ThresholdEntry>;

const ThresholdFiredTtl = 60;

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

const activeWarnCounts = new Map<string, number>();
const thresholdsFired = new Set<string>();

export async function getThresholds(
  container: Container,
  guildId: string,
): Promise<WarnThresholds> {
  const rows = await container.db.moderation.getWarnThresholds(guildId);
  const parsed: WarnThresholds = {};
  for (const row of rows) {
    parsed[String(row.warnCount)] = {
      action: row.action as ThresholdAction,
      duration: row.duration ?? undefined,
    };
  }
  return parsed;
}

export async function incrementWarnCount(
  container: Container,
  guildId: string,
  userId: string,
): Promise<number> {
  const key = `${guildId}:${userId}`;
  const existing = activeWarnCounts.get(key);
  if (existing !== undefined) {
    const next = existing + 1;
    activeWarnCounts.set(key, next);
    return next;
  }
  const count = (await container.db.moderation.countModerationCases(
    guildId,
    userId,
    "warn",
  )) + 1;
  activeWarnCounts.set(key, count);
  return count;
}

export async function decrementWarnCount(
  _container: Container,
  guildId: string,
  userId: string,
): Promise<void> {
  const key = `${guildId}:${userId}`;
  const existing = activeWarnCounts.get(key) ?? 0;
  if (existing > 0) {
    activeWarnCounts.set(key, existing - 1);
  }
}

export async function decrementWarnCounts(
  _container: Container,
  _entries: { guildId: string; userId: string }[],
): Promise<void> {}

export async function resetWarnCount(
  _container: Container,
  guildId: string,
  userId: string,
): Promise<void> {
  activeWarnCounts.delete(`${guildId}:${userId}`);
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

  const firedKey = `${guildId}:${userId}:${targetCount}`;
  if (thresholdsFired.has(firedKey)) return;
  thresholdsFired.add(firedKey);
  setTimeout(() => thresholdsFired.delete(firedKey), ThresholdFiredTtl * 1000);

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
