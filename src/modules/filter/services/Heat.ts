import { Time } from "#src/shared/Index.ts";
import { filterUrls } from "#src/lib/discord/Filters.js";

export interface HeatConfig {
  enabled: boolean;
  perMessage: number;
  perMention: number;
  perDuplicate: number;
  perSimilar: number;
  similarityThreshold: number;
  perZalgo: number;
  perFilterHit: number;
  perAttachment: number;
  perEmoji: number;
  perLink: number;
  webhookMultiplier: number;
  decayPerMinute: number;
  warnAt: number;
  timeoutAt: number;
  quarantineAt: number;
  timeoutMinutes: number;
  multiplierEnabled: boolean;
  multiplierBase: number;
  panicRaiderCount: number;
  panicWindowSeconds: number;
  lockdownMentionThreshold: number;
  lockdownWindowSeconds: number;
  lockdownDurationMinutes: number;
}

type HeatAction = "none" | "warn" | "timeout" | "quarantine";

export function decayHeat(
  stored: number,
  lastTs: number,
  now: number,
  decayPerMinute: number,
): number {
  if (decayPerMinute <= 0) return Math.max(0, stored);
  const minutes = Math.max(0, (now - lastTs) / Time.Minute);
  return Math.max(0, stored - minutes * decayPerMinute);
}

export function heatAction(heat: number, config: HeatConfig): HeatAction {
  if (config.quarantineAt > 0 && heat >= config.quarantineAt) {
    return "quarantine";
  }
  if (config.timeoutAt > 0 && heat >= config.timeoutAt) return "timeout";
  if (config.warnAt > 0 && heat >= config.warnAt) return "warn";
  return "none";
}

export function secondsUntilCool(heat: number, decayPerMinute: number): number {
  if (decayPerMinute <= 0) return 3600;
  return Math.ceil((heat / decayPerMinute) * 60) + 60;
}

export function escalatedTimeoutMinutes(
  baseMinutes: number,
  violations: number,
  config: Pick<HeatConfig, "multiplierEnabled" | "multiplierBase">,
): number {
  if (!config.multiplierEnabled || violations <= 1) return baseMinutes;
  const factor = config.multiplierBase ** Math.max(0, violations - 2);
  return Math.round(baseMinutes * factor);
}

const CustomEmojiRe = /<a?:\w+:\d+>/g;
const UnicodeEmojiRe = /\p{Extended_Pictographic}/gu;

export function containsLink(content: string): boolean {
  return filterUrls(content).length > 0;
}

export function countEmoji(content: string): number {
  const custom = content.match(CustomEmojiRe)?.length ?? 0;
  const withoutCustom = content.replace(CustomEmojiRe, "");
  const unicode = withoutCustom.match(UnicodeEmojiRe)?.length ?? 0;
  return custom + unicode;
}

const CombiningMarkRe = /\p{M}/gu;

export function isZalgo(content: string, ratioThreshold = 0.5): boolean {
  if (content.length === 0) return false;
  const marks = content.match(CombiningMarkRe)?.length ?? 0;
  return marks / content.length > ratioThreshold;
}
