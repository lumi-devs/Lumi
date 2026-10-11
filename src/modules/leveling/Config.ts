import type { Container } from "#src/lib/Services.js";
import { parseDuration } from "#src/lib/utilities/Time.js";
import { LevelingModuleName } from "#src/modules/leveling/Constants.js";
import {
  isLevelFormula,
  type LevelFormula,
} from "#src/modules/leveling/services/Formulas.js";

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

export const AnnounceMessageDefault =
  "{user} reached level {level}!";

const LevelingDefaults: LevelingConfig = {
  formula: "disgaea",
  messageXp: 15,
  messageCooldownMs: 60 * 1000,
  minMessageLength: 4,
  voiceEnabled: true,
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

function asDurationMs(value: unknown, fallback: number): number {
  if (typeof value !== "string" || value.length === 0) return fallback;
  return parseDuration(value) ?? fallback;
}

function asIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is string =>
      typeof entry === "string" && /^\d{17,20}$/.test(entry),
  );
}

function asMultipliers(value: unknown): XpMultiplier[] {
  if (!Array.isArray(value)) return [];
  const out: XpMultiplier[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const sep = entry.lastIndexOf(":");
    if (sep < 0) continue;
    const id = entry.slice(0, sep);
    const mult = Number(entry.slice(sep + 1));
    if (!/^\d{17,20}$/.test(id)) continue;
    if (!Number.isFinite(mult) || mult <= 0 || mult > 100) continue;
    out.push({ id, mult });
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
  services: Container,
  guildId: string,
): Promise<LevelingConfig> {
  const get = (key: string) =>
    services.db.config.getModuleConfig(guildId, LevelingModuleName, key);
  const [
    formula,
    messageXp,
    messageCooldown,
    minMessageLength,
    voiceEnabled,
    voiceXpPerMinute,
    announceEnabled,
    announceChannelId,
    announceMessage,
    ignoredChannels,
    ignoredRoles,
    levelRewards,
    roleStack,
    keepXpOnLeave,
    globalMultiplier,
    roleMultipliers,
    channelMultipliers,
  ] = await Promise.all([
    get("level_formula"),
    get("message_xp"),
    get("message_cooldown"),
    get("min_message_length"),
    get("voice_enabled"),
    get("voice_xp_per_minute"),
    get("announce_enabled"),
    get("announce_channel"),
    get("announce_message"),
    get("ignored_channels"),
    get("ignored_roles"),
    get("level_rewards"),
    get("role_stack"),
    get("keep_xp_on_leave"),
    get("global_multiplier"),
    get("role_multipliers"),
    get("channel_multipliers"),
  ]);

  return {
    formula: isLevelFormula(formula) ? formula : LevelingDefaults.formula,
    messageXp: Math.min(
      1000,
      Math.max(1, Math.floor(asNumber(messageXp, LevelingDefaults.messageXp))),
    ),
    messageCooldownMs: Math.max(
      1000,
      asDurationMs(messageCooldown, LevelingDefaults.messageCooldownMs),
    ),
    minMessageLength: Math.min(
      500,
      Math.max(
        0,
        Math.floor(
          asNumber(minMessageLength, LevelingDefaults.minMessageLength),
        ),
      ),
    ),
    voiceEnabled: asBoolean(voiceEnabled, LevelingDefaults.voiceEnabled),
    voiceXpPerMinute: Math.min(
      1000,
      Math.max(
        1,
        Math.floor(
          asNumber(voiceXpPerMinute, LevelingDefaults.voiceXpPerMinute),
        ),
      ),
    ),
    announceEnabled: asBoolean(
      announceEnabled,
      LevelingDefaults.announceEnabled,
    ),
    announceChannelId:
      typeof announceChannelId === "string" &&
      /^\d{17,20}$/.test(announceChannelId)
        ? announceChannelId
        : null,
    announceMessage: asString(
      announceMessage,
      LevelingDefaults.announceMessage,
    ).slice(0, 500),
    ignoredChannels: asIdList(ignoredChannels),
    ignoredRoles: asIdList(ignoredRoles),
    levelRewards: asRewards(levelRewards),
    roleStack: asBoolean(roleStack, LevelingDefaults.roleStack),
    keepXpOnLeave: asBoolean(keepXpOnLeave, LevelingDefaults.keepXpOnLeave),
    globalMultiplier: Math.min(
      100,
      Math.max(0, asNumber(globalMultiplier, LevelingDefaults.globalMultiplier)),
    ),
    roleMultipliers: asMultipliers(roleMultipliers),
    channelMultipliers: asMultipliers(channelMultipliers),
  };
}

export function applyMultipliers(
  base: number,
  config: LevelingConfig,
  roleIds: string[],
  channelId: string | null,
): number {
  let best = 1;
  for (const entry of config.roleMultipliers) {
    if (roleIds.includes(entry.id) && entry.mult > best) best = entry.mult;
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
    Math.floor(base * config.globalMultiplier * best * channelMult),
  );
}
