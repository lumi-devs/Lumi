import { isLevelFormula, type LevelFormula } from "./formulas.js";
import { LevelingModuleName } from "./constants.js";

export interface LevelReward {
  level: number;
  roleId: string;
}

export interface XpMultiplier {
  id: string;
  mult: number;
}

export interface LevelingConfig {
  formula: LevelFormula;
  messageXp: number;
  messageCooldownMs: number;
  minMessageLength: number;
  voiceEnabled: boolean;
  voiceXpPerMinute: number;
  announceEnabled: boolean;
  announceChannelId: string | null;
  announceMessage: string;
  ignoredChannels: string[];
  ignoredRoles: string[];
  levelRewards: LevelReward[];
  roleStack: boolean;
  keepXpOnLeave: boolean;
  globalMultiplier: number;
  roleMultipliers: XpMultiplier[];
  channelMultipliers: XpMultiplier[];
}

export const AnnounceMessageDefault = "{user} reached level {level}!";

const LevelingDefaults: LevelingConfig = {
  formula: "disgaea",
  messageXp: 15,
  messageCooldownMs: 60 * 1000,
  minMessageLength: 4,
  voiceEnabled: false,
  voiceXpPerMinute: 4,
  announceEnabled: true,
  announceChannelId: null,
  announceMessage: AnnounceMessageDefault,
  ignoredChannels: [],
  ignoredRoles: [],
  levelRewards: [],
  roleStack: true,
  keepXpOnLeave: true,
  globalMultiplier: 1,
  roleMultipliers: [],
  channelMultipliers: [],
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

function asIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is string =>
      typeof entry === "string" && /^\d{17,20}$/.test(entry),
  );
}

function asMultiplierEntry(value: unknown): XpMultiplier | null {
  if (typeof value !== "object" || value === null) return null;
  const { id, multiplier } = value as { id?: unknown; multiplier?: unknown };
  if (typeof id !== "string" || !/^\d{17,20}$/.test(id)) return null;
  if (
    typeof multiplier !== "number" ||
    !Number.isFinite(multiplier) ||
    multiplier <= 0 ||
    multiplier > 100
  )
    return null;
  return { id, mult: multiplier };
}

function asMultiplierList(value: unknown): XpMultiplier[] {
  if (!Array.isArray(value)) return [];
  const out: XpMultiplier[] = [];
  for (const entry of value) {
    const parsed = asMultiplierEntry(entry);
    if (parsed && !out.some((existing) => existing.id === parsed.id)) {
      out.push(parsed);
    }
  }
  return out;
}

function asRewards(value: unknown): LevelReward[] {
  if (!Array.isArray(value)) return [];
  const out: LevelReward[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const { level, roleId } = entry as { level?: unknown; roleId?: unknown };
    if (typeof level !== "number" || !Number.isInteger(level) || level < 2)
      continue;
    if (typeof roleId !== "string" || !/^\d{17,20}$/.test(roleId)) continue;
    if (out.some((r) => r.level === level)) continue;
    out.push({ level, roleId });
  }
  return out.sort((a, b) => a.level - b.level);
}

export async function getLevelingConfig(
  services: any,
  guildId: string,
): Promise<LevelingConfig> {
  const stored = (await services.config.get(guildId, LevelingModuleName)) ?? {};
  return {
    formula: isLevelFormula(stored.formula)
      ? stored.formula
      : LevelingDefaults.formula,
    messageXp: Math.min(
      1000,
      Math.max(1, Math.floor(asNumber(stored.messageXp, LevelingDefaults.messageXp))),
    ),
    messageCooldownMs: Math.min(
      3600 * 1000,
      Math.max(1000, asNumber(
        stored.messageCooldownMs,
        LevelingDefaults.messageCooldownMs,
      )),
    ),
    minMessageLength: Math.min(
      500,
      Math.max(
        0,
        Math.floor(asNumber(
          stored.minMessageLength,
          LevelingDefaults.minMessageLength,
        )),
      ),
    ),
    voiceEnabled: asBoolean(
      stored.voiceEnabled,
      LevelingDefaults.voiceEnabled,
    ),
    voiceXpPerMinute: Math.min(
      1000,
      Math.max(
        1,
        Math.floor(asNumber(
          stored.voiceXpPerMinute,
          LevelingDefaults.voiceXpPerMinute,
        )),
      ),
    ),
    announceEnabled: asBoolean(
      stored.announceEnabled,
      LevelingDefaults.announceEnabled,
    ),
    announceChannelId:
      typeof stored.announceChannelId === "string" &&
      /^\d{17,20}$/.test(stored.announceChannelId)
        ? stored.announceChannelId
        : null,
    announceMessage: asString(
      stored.announceMessage,
      LevelingDefaults.announceMessage,
    ).slice(0, 500),
    ignoredChannels: asIdList(stored.ignoredChannels),
    ignoredRoles: asIdList(stored.ignoredRoles),
    levelRewards: asRewards(stored.levelRewards),
    roleStack: asBoolean(stored.roleStack, LevelingDefaults.roleStack),
    keepXpOnLeave: asBoolean(
      stored.keepXpOnLeave,
      LevelingDefaults.keepXpOnLeave,
    ),
    globalMultiplier: Math.min(
      100,
      Math.max(0, asNumber(stored.globalMultiplier, LevelingDefaults.globalMultiplier)),
    ),
    roleMultipliers: asMultiplierList(stored.roleMultipliers),
    channelMultipliers: asMultiplierList(stored.channelMultipliers),
  };
}

export function applyMultipliers(
  base: number,
  config: LevelingConfig,
  roleIds: string[],
  channelId: string | null,
): number {
  let roleMult = 1;
  for (const entry of config.roleMultipliers) {
    if (roleIds.includes(entry.id) && entry.mult > roleMult) roleMult = entry.mult;
  }
  let channelMult = 1;
  if (channelId) {
    for (const entry of config.channelMultipliers) {
      if (entry.id === channelId && entry.mult > channelMult)
        channelMult = entry.mult;
    }
  }
  return Math.max(
    1,
    Math.floor(base * config.globalMultiplier * roleMult * channelMult),
  );
}
