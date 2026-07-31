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
