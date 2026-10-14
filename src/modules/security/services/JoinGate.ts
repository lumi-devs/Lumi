import { container } from "#src/lib/Services.js";
import { Colors, type Guild, type GuildMember } from "discord.js";
import { isNullish } from "#src/shared/Index.ts";
import { QuarantineAction } from "#src/lib/api/moderation/Quarantine.js";
import { logToChannel } from "#src/lib/api/moderation/ModLog.js";
import { toStringArray } from "#src/lib/module-system/ConfigSchema.js";
import { tryGetUtility } from "#src/lib/module-system/Utility.js";
import {
  hasNoAvatar,
  isUnverifiedBot,
  matchesUsernamePattern,
  hasAdvertisingIndicators,
  hasSimilarRecentJoiner,
  isCreationClustered,
  type RecentJoiner,
} from "#src/modules/security/services/JoinHeuristics.js";
import { getConfigNumber, getConfigAction } from "#src/modules/security/services/ConfigHelpers.js";

export type GateAction = "log" | "kick" | "timeout" | "quarantine";

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

interface JoinGateConfig {
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

interface JoinFilterResult {
  action: GateAction;
  triggered: string[];
}

const RaidModeSeconds = 600;
const GateTimeoutMs = 60 * 60 * 1000;
const RecentJoinersCap = 20;

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

const recentJoinersMap = new Map<string, RecentJoiner[]>();
const joinBurstMap = new Map<string, { count: number; expiresAt: number }>();
const raidActiveMap = new Map<string, number>();

export async function recordRecentJoiner(guildId: string, joiner: RecentJoiner): Promise<void> {
  const list = recentJoinersMap.get(guildId) ?? [];
  list.unshift(joiner);
  if (list.length > RecentJoinersCap) list.length = RecentJoinersCap;
  recentJoinersMap.set(guildId, list);
}

async function getRecentJoiners(guildId: string): Promise<RecentJoiner[]> {
  return recentJoinersMap.get(guildId) ?? [];
}

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

export async function recordJoin(
  guildId: string,
  config: JoinGateConfig,
): Promise<boolean> {
  const now = Date.now();
  const entry = joinBurstMap.get(guildId);
  let count = 1;
  if (entry && entry.expiresAt > now) {
    count = entry.count + 1;
    entry.count = count;
  } else {
    joinBurstMap.set(guildId, { count: 1, expiresAt: now + config.raidWindowSeconds * 1000 });
  }

  if (count < config.raidJoinCount) return false;

  const activeUntil = raidActiveMap.get(guildId);
  if (!activeUntil || activeUntil <= now) {
    raidActiveMap.set(guildId, now + RaidModeSeconds * 1000);
    return true;
  }
  return false;
}

export async function isRaidActive(guildId: string): Promise<boolean> {
  const activeUntil = raidActiveMap.get(guildId);
  return Boolean(activeUntil && activeUntil > Date.now());
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
    await logService?.dispatch(container, {
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
      container,
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
