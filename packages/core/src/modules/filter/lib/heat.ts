export interface HeatConfig {
  enabled: boolean;
  /** Points added for every message from a non-exempt member. */
  perMessage: number;
  /** Points added per user/role mention. */
  perMention: number;
  /** Points added when a message repeats the member's previous one. */
  perDuplicate: number;
  /** Points added when a message trips a hard filter rule. */
  perFilterHit: number;
  /** Points added per attachment (image/embed-spam signal). */
  perAttachment: number;
  /** Points added per emoji (custom or unicode). */
  perEmoji: number;
  /** Points added when the message contains a link (advertisement signal). */
  perLink: number;
  /** `perMessage`/`perLink` are multiplied by this for webhook-sent messages. */
  webhookMultiplier: number;
  /** Points bled off per minute (decay-on-read). */
  decayPerMinute: number;
  /** Heat at/above which a warning fires (0 disables). */
  warnAt: number;
  /** Heat at/above which the member is timed out (0 disables). */
  timeoutAt: number;
  /** Heat at/above which the member is quarantined (0 disables). */
  quarantineAt: number;
  /** Timeout duration applied at the timeout threshold. */
  timeoutMinutes: number;
  /** Escalate repeat timeouts geometrically instead of reapplying the same duration. */
  multiplierEnabled: boolean;
  /** Base of the geometric escalation (Wick's default reads 1 -> 1 -> 11 -> 22 -> 44, i.e. base 2 after the first repeat). */
  multiplierBase: number;
  /** Distinct members that must trip timeout/quarantine within the panic window to activate heat panic mode. */
  panicRaiderCount: number;
  /** Window, in seconds, for counting distinct raiders toward heat panic mode. */
  panicWindowSeconds: number;
  /** Guild-wide non-exempt mentions within the window that trigger auto-lockdown (0 disables). */
  lockdownMentionThreshold: number;
  /** Window, in seconds, for counting mentions toward auto-lockdown. */
  lockdownWindowSeconds: number;
  /** How long the auto-triggered lockdown lasts before auto-unlocking. */
  lockdownDurationMinutes: number;
}

export type HeatAction = "none" | "warn" | "timeout" | "quarantine";

/** Linear decay: subtract `decayPerMinute` for every minute since the last touch. */
export function decayHeat(
  stored: number,
  lastTs: number,
  now: number,
  decayPerMinute: number,
): number {
  if (decayPerMinute <= 0) return Math.max(0, stored);
  const minutes = Math.max(0, (now - lastTs) / 60_000);
  return Math.max(0, stored - minutes * decayPerMinute);
}

/**
 * Highest escalation a heat level warrants. Thresholds are checked most-severe
 * first; a threshold of 0 is disabled and never trips.
 */
export function heatAction(heat: number, config: HeatConfig): HeatAction {
  if (config.quarantineAt > 0 && heat >= config.quarantineAt) {
    return "quarantine";
  }
  if (config.timeoutAt > 0 && heat >= config.timeoutAt) return "timeout";
  if (config.warnAt > 0 && heat >= config.warnAt) return "warn";
  return "none";
}

/** Seconds until `heat` fully decays to zero — used to auto-expire the Redis key. */
export function secondsUntilCool(heat: number, decayPerMinute: number): number {
  if (decayPerMinute <= 0) return 3600;
  return Math.ceil((heat / decayPerMinute) * 60) + 60;
}

/**
 * Timeout duration for the `violations`-th timeout since the member's last
 * cool-down, following Wick's 1 -> 1 -> 11 -> 22 -> 44 shape: the first
 * repeat keeps the base duration, then each further repeat multiplies by
 * `multiplierBase`.
 */
export function escalatedTimeoutMinutes(
  baseMinutes: number,
  violations: number,
  config: Pick<HeatConfig, "multiplierEnabled" | "multiplierBase">,
): number {
  if (!config.multiplierEnabled || violations <= 1) return baseMinutes;
  const factor = config.multiplierBase ** Math.max(0, violations - 2);
  return Math.round(baseMinutes * factor);
}

// No `g` flag: `.test()` on a global regex is stateful (tracks `lastIndex`
// across calls on the same shared instance), which would corrupt results
// across concurrent messages sharing this module-level regex.
const HEAT_URL_RE = /https?:\/\/[^\s/<>"']+/i;
const CUSTOM_EMOJI_RE = /<a?:\w+:\d+>/g;
const UNICODE_EMOJI_RE = /\p{Extended_Pictographic}/gu;

/** True if the message contains a link — a cheap advertisement/spam signal. */
export function containsLink(content: string): boolean {
  return HEAT_URL_RE.test(content);
}

/** Counts custom (`<:name:id>`) and unicode emoji in a message. */
export function countEmoji(content: string): number {
  const custom = content.match(CUSTOM_EMOJI_RE)?.length ?? 0;
  const withoutCustom = content.replace(CUSTOM_EMOJI_RE, "");
  const unicode = withoutCustom.match(UNICODE_EMOJI_RE)?.length ?? 0;
  return custom + unicode;
}
