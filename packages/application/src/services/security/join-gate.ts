import { container } from "@sapphire/framework";
import { Colors, type Guild, type GuildMember } from "discord.js";
import { isNullish, tryParseJSON } from "@sapphire/utilities";
import { RedisKeys } from "#lib/database/redis.js";
import { QuarantineAction } from "#lib/moderation/QuarantineAction.js";
import { logToChannel } from "#lib/moderation/log.js";
import { toStringArray } from "#lib/module-system/config-schema.js";
import { tryGetUtility } from "#lib/module-system/Utility.js";
import {
  hasNoAvatar,
  isUnverifiedBot,
  matchesUsernamePattern,
  hasAdvertisingIndicators,
  hasSimilarRecentJoiner,
  isCreationClustered,
  type RecentJoiner,
} from "./join-heuristics.js";
import { getConfigNumber, getConfigAction } from "./config-helpers.js";

export type GateAction = "log" | "kick" | "timeout" | "quarantine";

/** Severity order used to pick a single action when several filters trip at once. */
const GateActionSeverity: Record<GateAction, number> = {
  log: 0,
  kick: 1,
  timeout: 2,
  quarantine: 3,
};

type RaidAccountType = "all" | "suspicious";

interface JoinGateFilterConfig {
  enabled: boolean;
  action: GateAction;
}

export interface JoinGateConfig {
  enabled: boolean;
  raidJoinCount: number;
  raidWindowSeconds: number;
  raidAction: GateAction;
  raidAccountType: RaidAccountType;
  raidWarnRoleIds: string[];
  filterNoAvatar: JoinGateFilterConfig;
  filterMinAge: JoinGateFilterConfig & { hours: number };
  filterUnverifiedBot: JoinGateFilterConfig;
  filterUsernamePattern: JoinGateFilterConfig & { patterns: string[] };
  filterAdvertising: JoinGateFilterConfig;
}

export interface JoinFilterResult {
  action: GateAction;
  triggered: string[];
}

const RaidModeSeconds = 600;
const GateTimeoutMs = 60 * 60 * 1000;
const RecentJoinersCap = 20;
const RecentJoinersTtlSeconds = 300;

export async function loadJoinGateConfig(guildId: string): Promise<JoinGateConfig> {
  const raw = await container.db.config.getAllModuleConfig(guildId, "security");

  return {
    enabled: raw["joingate_enabled"] === true,
    raidJoinCount: getConfigNumber(raw, "raid_join_count", 10),
    raidWindowSeconds: getConfigNumber(raw, "raid_window_seconds", 30),
    raidAction: getConfigAction(raw, "raid_action", "kick"),
    raidAccountType: raw["raid_account_type"] === "suspicious" ? "suspicious" : "all",
    raidWarnRoleIds: toStringArray(raw["raid_warn_role_ids"]),
    filterNoAvatar: {
      enabled: raw["filter_no_avatar_enabled"] === true,
      action: getConfigAction(raw, "filter_no_avatar_action", "log"),
    },
    filterMinAge: {
      enabled: raw["filter_min_age_enabled"] === true,
      hours: getConfigNumber(raw, "filter_min_age_hours", 0),
      action: getConfigAction(raw, "filter_min_age_action", "kick"),
    },
    filterUnverifiedBot: {
      enabled: raw["filter_unverified_bot_enabled"] === true,
      action: getConfigAction(raw, "filter_unverified_bot_action", "kick"),
    },
    filterUsernamePattern: {
      enabled: raw["filter_username_pattern_enabled"] === true,
      patterns: toStringArray(raw["filter_username_pattern"]),
      action: getConfigAction(raw, "filter_username_pattern_action", "log"),
    },
    filterAdvertising: {
      enabled: raw["filter_advertising_enabled"] === true,
      action: getConfigAction(raw, "filter_advertising_action", "kick"),
    },
  };
}

/**
 * Runs every enabled join-gate filter against a member and returns the
 * single most severe triggered action (quarantine > timeout > kick > log),
 * or null when nothing tripped.
 */
export function evaluateJoinFilters(
  member: GuildMember,
  config: JoinGateConfig,
): JoinFilterResult | null {
  const triggered: string[] = [];
  let action: GateAction | null = null;
  const consider = (hit: boolean, filterAction: GateAction, label: string) => {
    if (!hit) return;
    triggered.push(label);
    if (action === null || GateActionSeverity[filterAction] > GateActionSeverity[action]) {
      action = filterAction;
    }
  };

  if (config.filterNoAvatar.enabled) {
    consider(hasNoAvatar(member.user), config.filterNoAvatar.action, "no avatar");
  }
  if (config.filterMinAge.enabled && config.filterMinAge.hours > 0) {
    const ageMs = Date.now() - member.user.createdTimestamp;
    consider(
      ageMs < config.filterMinAge.hours * 60 * 60 * 1000,
      config.filterMinAge.action,
      `account younger than ${config.filterMinAge.hours}h`,
    );
  }
  if (config.filterUnverifiedBot.enabled) {
    consider(isUnverifiedBot(member.user), config.filterUnverifiedBot.action, "unverified bot");
  }
  if (config.filterUsernamePattern.enabled && config.filterUsernamePattern.patterns.length > 0) {
    consider(
      matchesUsernamePattern(member.user.username, config.filterUsernamePattern.patterns),
      config.filterUsernamePattern.action,
      "username pattern match",
    );
  }
  if (config.filterAdvertising.enabled) {
    consider(
      hasAdvertisingIndicators(member.user),
      config.filterAdvertising.action,
      "advertising account",
    );
  }

  if (action === null) return null;
  return { action, triggered };
}

/** Tracks a joiner for the short-lived recent-joiners window used by the raid/similarity heuristics. */
export async function recordRecentJoiner(guildId: string, joiner: RecentJoiner): Promise<void> {
  const key = RedisKeys.recentJoiners(guildId);
  await container.redis
    .multi()
    .lpush(key, JSON.stringify(joiner))
    .ltrim(key, 0, RecentJoinersCap - 1)
    .expire(key, RecentJoinersTtlSeconds)
    .exec();
}

async function getRecentJoiners(guildId: string): Promise<RecentJoiner[]> {
  const raw = await container.redis.lrange(RedisKeys.recentJoiners(guildId), 0, -1);
  return raw
    .map((r: string) => tryParseJSON(r) as RecentJoiner | null)
    .filter((j: RecentJoiner | null): j is RecentJoiner => j !== null);
}

/**
 * "Suspicious" scope for raid mode: no avatar, under the configured min
 * age, a username too close to a recent joiner's, or an unusual share of
 * recent joiners sharing this account's creation day - any one is enough,
 * this doesn't need to be a tunable score.
 */
export async function isSuspiciousJoiner(
  member: GuildMember,
  config: JoinGateConfig,
): Promise<boolean> {
  if (hasNoAvatar(member.user)) return true;
  const minAgeHours = config.filterMinAge.hours > 0 ? config.filterMinAge.hours : 24;
  if (Date.now() - member.user.createdTimestamp < minAgeHours * 60 * 60 * 1000) return true;

  const recent = await getRecentJoiners(member.guild.id);
  if (hasSimilarRecentJoiner(member.user.username, recent)) return true;
  if (isCreationClustered(member.user.createdTimestamp, recent)) return true;
  return false;
}

/**
 * Counts a join toward raid detection. Returns true when this join pushes
 * the guild over the threshold and raid mode was newly activated.
 */
export async function recordJoin(
  guildId: string,
  config: JoinGateConfig,
): Promise<boolean> {
  const key = RedisKeys.joinBurst(guildId);
  const results = await container.redis
    .multi()
    .incr(key)
    .expire(key, config.raidWindowSeconds, "NX")
    .exec();
  const count = results?.[0]?.[1] as number;
  if (count < config.raidJoinCount) return false;

  const started = await container.redis.set(
    RedisKeys.raidMode(guildId),
    String(Date.now()),
    "EX",
    RaidModeSeconds,
    "NX",
  );
  return started === "OK";
}

export async function isRaidActive(guildId: string): Promise<boolean> {
  return (await container.redis.exists(RedisKeys.raidMode(guildId))) === 1;
}

export async function applyGateAction(
  guild: Guild,
  memberId: string,
  action: GateAction,
  reason: string,
): Promise<boolean> {
  const botUser = container.client.user;
  if (isNullish(botUser)) return false;

  if (action === "log") {
    const logService = tryGetUtility("guild-log");
    await logService?.dispatch({
      guildId: guild.id,
      moduleName: "security",
      action: "📝 Gate Logged",
      targetId: memberId,
      actorId: botUser.id,
      reason,
      color: Colors.Yellow,
    });
    return true;
  }

  const member = await guild.members.fetch(memberId).catch(() => null);
  if (isNullish(member)) return false;

  try {
    if (action === "kick") {
      await member.kick(reason);
    } else if (action === "timeout") {
      await member.timeout(GateTimeoutMs, reason);
    } else {
      await QuarantineAction.apply({
        guild,
        targetMember: member,
        moderator: botUser,
        reason,
      });
      return true;
    }
    const c = await container.db.moderation.createModerationCase({
      guildId: guild.id,
      userId: memberId,
      moderatorId: botUser.id,
      action: action === "kick" ? "kick" : "mute",
      reason,
    });
    await logToChannel(
      guild.id,
      action === "kick" ? "👢 Gate Kicked" : "🔇 Gate Timed Out",
      Colors.Orange,
      memberId,
      botUser,
      reason,
      c.caseNumber,
      "security",
    );
    return true;
  } catch (err: unknown) {
    container.logger.warn(
      `[security] Gate ${action} failed for ${memberId} in ${guild.id}: ${String(err)}`,
    );
    return false;
  }
}
