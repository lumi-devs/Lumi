import type { Guild, GuildMember } from "discord.js";
import type { LumiServices } from "@lumi/module-kit";
import { parseDuration, Time } from "@lumi/foundation";
import { getModConfig } from "./config.ts";
import { logModAction, notifyPunishedUser, recordCase } from "./case.ts";
import { applyQuarantine, QuarantineError } from "./quarantine.ts";

export type WarnThresholdAction = "mute" | "kick" | "ban" | "quarantine" | "voice_mute";

interface ThresholdRule {
  readonly action: WarnThresholdAction;
  /** Duration string ("1h") or seconds, matching v1's stored rule shape. */
  readonly duration?: string | number | undefined;
}

const Actions = new Set<WarnThresholdAction>([
  "mute",
  "kick",
  "ban",
  "quarantine",
  "voice_mute",
]);

const MaxTimeoutMs = 28 * Time.Day;
const ThresholdFiredTtlSeconds = 60;

export function parseWarnThresholds(raw: string): Map<number, ThresholdRule> {
  const parsed: unknown = (() => {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  })();

  const rules = new Map<number, ThresholdRule>();
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return rules;

  for (const [countRaw, value] of Object.entries(parsed)) {
    const count = Number.parseInt(countRaw, 10);
    if (!Number.isInteger(count) || count < 1) continue;
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const entry = value as { action?: unknown; duration?: unknown };
    if (typeof entry.action !== "string" || !Actions.has(entry.action as WarnThresholdAction)) {
      continue;
    }
    rules.set(count, {
      action: entry.action as WarnThresholdAction,
      ...(typeof entry.duration === "string" || typeof entry.duration === "number"
        ? { duration: entry.duration }
        : {}),
    });
  }

  return rules;
}

export function isImmune(member: GuildMember, immuneRoleIds: readonly string[]): boolean {
  if (immuneRoleIds.length === 0) return false;
  return member.roles.cache.some((role) => immuneRoleIds.includes(role.id));
}

function resolveDuration(raw: string | number | undefined): number {
  if (raw === undefined) return Time.Hour;
  // v1 stored durations as whole seconds; the JSON example in the docs uses
  // duration strings. Accept both so imported rules keep working.
  const parsed = typeof raw === "number" ? raw * 1_000 : parseDuration(raw);
  if (!parsed || parsed <= 0) return Time.Hour;
  return Math.min(parsed, MaxTimeoutMs);
}

async function applyRule(
  services: LumiServices,
  guild: Guild,
  member: GuildMember,
  rule: ThresholdRule,
  warnCount: number,
  targetCount: number,
  moderatorId: string,
): Promise<void> {
  const reason = `Auto: ${warnCount} warning${warnCount === 1 ? "" : "s"} reached threshold (${targetCount}).`;
  const audit = `${reason} | Automated threshold`;

  if (rule.action === "mute") {
    const durationMs = resolveDuration(rule.duration);
    const modCase = await recordCase(services, guild.id, {
      userId: member.id,
      moderatorId,
      action: "mute",
      duration: Math.floor(durationMs / 1_000),
      expiresAt: new Date(Date.now() + durationMs),
      reason,
    });
    try {
      await member.timeout(durationMs, audit);
    } catch (error) {
      await services.db.moderation.deleteCase(guild.id, modCase.caseNumber);
      throw error;
    }
    await notifyPunishedUser(services, guild, member.user, "timeout", reason);
    await logModAction(services, guild, modCase);
    return;
  }

  if (rule.action === "kick") {
    const modCase = await recordCase(services, guild.id, {
      userId: member.id,
      moderatorId,
      action: "kick",
      reason,
    });
    try {
      await member.kick(audit);
    } catch (error) {
      await services.db.moderation.deleteCase(guild.id, modCase.caseNumber);
      throw error;
    }
    await notifyPunishedUser(services, guild, member.user, "kick", reason);
    await logModAction(services, guild, modCase);
    return;
  }

  if (rule.action === "ban") {
    const modCase = await recordCase(services, guild.id, {
      userId: member.id,
      moderatorId,
      action: "ban",
      reason,
    });
    try {
      await guild.members.ban(member.id, { reason: audit });
    } catch (error) {
      await services.db.moderation.deleteCase(guild.id, modCase.caseNumber);
      throw error;
    }
    await notifyPunishedUser(services, guild, member.user, "ban", reason);
    await logModAction(services, guild, modCase);
    return;
  }

  if (rule.action === "voice_mute") {
    const durationMs = resolveDuration(rule.duration);
    const modCase = await recordCase(services, guild.id, {
      userId: member.id,
      moderatorId,
      action: "voice_mute",
      duration: Math.floor(durationMs / 1_000),
      expiresAt: new Date(Date.now() + durationMs),
      reason,
    });
    if (member.voice.channel) {
      await member.voice.setMute(true, audit);
    }
    await logModAction(services, guild, modCase);
    return;
  }

  try {
    await applyQuarantine(services, member, {
      moderatorId,
      reason,
    });
  } catch (error) {
    if (error instanceof QuarantineError && error.code === "already-quarantined") return;
    throw error;
  }

  await services.db.moderation.deactivateActiveCases(guild.id, member.id, "quarantine");
  const modCase = await recordCase(services, guild.id, {
    userId: member.id,
    moderatorId,
    action: "quarantine",
    reason,
  });
  await notifyPunishedUser(services, guild, member.user, "quarantine", reason);
  await logModAction(services, guild, modCase);
}

export async function applyWarnThresholds(
  services: LumiServices,
  guild: Guild,
  member: GuildMember,
  warnCount: number,
): Promise<void> {
  const config = await getModConfig(services, guild.id).catch(() => null);
  if (!config) return;

  const rules = parseWarnThresholds(config.warn_thresholds);
  if (rules.size === 0) return;

  const matching = [...rules.keys()].filter((count) => count <= warnCount).sort((a, b) => b - a);
  const targetCount = matching[0];
  if (targetCount === undefined) return;

  const moderatorId = services.client.user?.id;
  if (!moderatorId) return;
  if (member.id === guild.ownerId || member.id === moderatorId) return;
  if (isImmune(member, config.immune_role_ids)) {
    services.logger.debug(
      { guildId: guild.id, userId: member.id, targetCount },
      "warn threshold skipped for immune member",
    );
    return;
  }

  const claimed = await services.redis.set(
    services.keys.cooldown("warn-threshold", `${guild.id}:${member.id}:${targetCount}`),
    "1",
    "EX",
    ThresholdFiredTtlSeconds,
    "NX",
  );
  if (claimed !== "OK") return;

  const rule = rules.get(targetCount);
  if (!rule) return;

  services.logger.info(
    { guildId: guild.id, userId: member.id, warnCount, targetCount, action: rule.action },
    "applying warn threshold",
  );

  await applyRule(services, guild, member, rule, warnCount, targetCount, moderatorId);
  services.logger.info(
    { guildId: guild.id, userId: member.id, action: rule.action },
    "warn threshold applied",
  );
}
