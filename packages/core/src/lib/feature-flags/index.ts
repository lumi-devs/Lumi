import type { Container } from "#lib/services.js";
import { rolloutBucket } from "#lib/feature-flags/hash.js";

/**
 * Resolves whether `key` is on, given an optional guild scope.
 *
 * Precedence: a per-guild override always wins; otherwise the flag must be
 * `enabled` and the (key, guild) pair's stable hash bucket must fall inside
 * `rolloutPercent`. An unknown key is always `false` - there is no implicit
 * "flags default on" behavior.
 */
export async function isFlagEnabled(
  services: Container,
  key: string,
  guildId?: string,
): Promise<boolean> {
  if (guildId) {
    const override = await services.db.featureFlags.getOverride(key, guildId);
    if (override) return override.enabled;
  }

  const flag = await services.db.featureFlags.getFlagForEvaluation(key);
  if (!flag || !flag.enabled) return false;
  if (flag.rolloutPercent >= 100) return true;
  if (flag.rolloutPercent <= 0) return false;

  return rolloutBucket(key, guildId ?? null) < flag.rolloutPercent;
}
