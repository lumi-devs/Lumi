import { asIdList, isSnowflake } from "@lumi/foundation";
import { LevelingConfigKey } from "./constants.js";
import { isLevelFormula, type LevelFormula } from "./formulas.js";

export interface LevelReward {
  level: number;
  roleId: string;
  removePrevious: boolean;
}

interface RoleMultiplier {
  roleId: string;
  multiplier: number;
}

interface ChannelMultiplier {
  channelId: string;
  multiplier: number;
}

export interface LevelingConfig {
  levelFormula: LevelFormula;
  xpPerMessage: number;
  cooldownSeconds: number;
  voiceEnabled: boolean;
  voiceXpPerMinute: number;
  announceEnabled: boolean;
  announceChannel: string | null;
  announceMessage: string;
  minMessageLength: number;
  roleRewards: LevelReward[];
  roleStack: boolean;
  keepXpOnLeave: boolean;
  globalMultiplier: number;
  multiplierRoles: RoleMultiplier[];
  channelMultipliers: ChannelMultiplier[];
  ignoredChannels: string[];
  whitelistedChannels: string[];
  ignoredRoles: string[];
  whitelistedRoles: string[];
}

export const AnnounceMessageDefault = "{user} reached level {level}!";

const LevelingDefaults: LevelingConfig = {
  levelFormula: "disgaea",
  xpPerMessage: 15,
  cooldownSeconds: 60,
  voiceEnabled: false,
  voiceXpPerMinute: 4,
  announceEnabled: true,
  announceChannel: null,
  announceMessage: AnnounceMessageDefault,
  minMessageLength: 4,
  roleRewards: [],
  roleStack: true,
  keepXpOnLeave: true,
  globalMultiplier: 1,
  multiplierRoles: [],
  channelMultipliers: [],
  ignoredChannels: [],
  whitelistedChannels: [],
  ignoredRoles: [],
  whitelistedRoles: [],
};

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asRewards(value: unknown): LevelReward[] {
  if (!Array.isArray(value)) return [];
  const rewards: LevelReward[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const { level, roleId, removePrevious } = entry as {
      level?: unknown;
      roleId?: unknown;
      removePrevious?: unknown;
    };
    if (typeof level !== "number" || !Number.isInteger(level) || level < 1) {
      continue;
    }
    if (!isSnowflake(roleId)) continue;
    if (rewards.some((reward) => reward.level === level)) continue;
    rewards.push({
      level,
      roleId,
      removePrevious: removePrevious === true,
    });
  }
  return rewards.sort((a, b) => a.level - b.level);
}

function asRoleMultipliers(value: unknown): RoleMultiplier[] {
  if (!Array.isArray(value)) return [];
  const multipliers: RoleMultiplier[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const { roleId, multiplier } = entry as {
      roleId?: unknown;
      multiplier?: unknown;
    };
    if (!isSnowflake(roleId) || !isMultiplier(multiplier)) continue;
    if (multipliers.some((existing) => existing.roleId === roleId)) continue;
    multipliers.push({ roleId, multiplier });
  }
  return multipliers;
}

function asChannelMultipliers(value: unknown): ChannelMultiplier[] {
  if (!Array.isArray(value)) return [];
  const multipliers: ChannelMultiplier[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const { channelId, multiplier } = entry as {
      channelId?: unknown;
      multiplier?: unknown;
    };
    if (!isSnowflake(channelId) || !isMultiplier(multiplier)) continue;
    if (multipliers.some((existing) => existing.channelId === channelId)) {
      continue;
    }
    multipliers.push({ channelId, multiplier });
  }
  return multipliers;
}

function isMultiplier(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value > 0 &&
    value <= 100
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export async function getLevelingConfig(
  services: { config: { get(guildId: string, name: string): Promise<unknown> } },
  guildId: string,
): Promise<LevelingConfig> {
  const stored =
    ((await services.config.get(guildId, LevelingConfigKey)) ??
      {}) as Record<string, unknown>;

  const announceChannel = stored.announceChannel;
  return {
    levelFormula: isLevelFormula(stored.levelFormula)
      ? stored.levelFormula
      : LevelingDefaults.levelFormula,
    xpPerMessage: Math.floor(
      clamp(
        asNumber(stored.xpPerMessage, LevelingDefaults.xpPerMessage),
        1,
        1000,
      ),
    ),
    cooldownSeconds: Math.floor(
      clamp(
        asNumber(stored.cooldownSeconds, LevelingDefaults.cooldownSeconds),
        1,
        3600,
      ),
    ),
    voiceEnabled: asBoolean(
      stored.voiceEnabled,
      LevelingDefaults.voiceEnabled,
    ),
    voiceXpPerMinute: Math.floor(
      clamp(
        asNumber(stored.voiceXpPerMinute, LevelingDefaults.voiceXpPerMinute),
        1,
        1000,
      ),
    ),
    announceEnabled: asBoolean(
      stored.announceEnabled,
      LevelingDefaults.announceEnabled,
    ),
    announceChannel: isSnowflake(announceChannel) ? announceChannel : null,
    announceMessage: asString(
      stored.announceMessage,
      LevelingDefaults.announceMessage,
    ).slice(0, 500),
    minMessageLength: Math.floor(
      clamp(
        asNumber(stored.minMessageLength, LevelingDefaults.minMessageLength),
        0,
        500,
      ),
    ),
    roleRewards: asRewards(stored.roleRewards),
    roleStack: asBoolean(stored.roleStack, LevelingDefaults.roleStack),
    keepXpOnLeave: asBoolean(
      stored.keepXpOnLeave,
      LevelingDefaults.keepXpOnLeave,
    ),
    globalMultiplier: clamp(
      asNumber(stored.globalMultiplier, LevelingDefaults.globalMultiplier),
      0,
      100,
    ),
    multiplierRoles: asRoleMultipliers(stored.multiplierRoles),
    channelMultipliers: asChannelMultipliers(stored.channelMultipliers),
    ignoredChannels: asIdList(stored.ignoredChannels),
    whitelistedChannels: asIdList(stored.whitelistedChannels),
    ignoredRoles: asIdList(stored.ignoredRoles),
    whitelistedRoles: asIdList(stored.whitelistedRoles),
  };
}

export function channelEarnsXp(
  config: Pick<LevelingConfig, "ignoredChannels" | "whitelistedChannels">,
  channelId: string,
): boolean {
  if (config.whitelistedChannels.length > 0) {
    return config.whitelistedChannels.includes(channelId);
  }
  return !config.ignoredChannels.includes(channelId);
}

export function rolesEarnXp(
  config: Pick<LevelingConfig, "ignoredRoles" | "whitelistedRoles">,
  roleIds: Iterable<string>,
): boolean {
  const roles = new Set(roleIds);
  if (config.whitelistedRoles.length > 0) {
    return config.whitelistedRoles.some((roleId) => roles.has(roleId));
  }
  return !config.ignoredRoles.some((roleId) => roles.has(roleId));
}
