import { container } from "@sapphire/framework";
import { rolloutBucket } from "#lib/feature-flags/hash.js";

export { fnv1aHash, rolloutBucket } from "#lib/feature-flags/hash.js";

/**
 * Resolves whether `key` is on, given an optional guild scope.
 *
 * Precedence: a per-guild override always wins; otherwise the flag must be
 * `enabled` and the (key, guild) pair's stable hash bucket must fall inside
 * `rolloutPercent`. An unknown key is always `false` - there is no implicit
 * "flags default on" behavior.
 */
export async function isFlagEnabled(
  key: string,
  guildId?: string,
): Promise<boolean> {
  if (guildId) {
    const override = await container.db.featureFlags.getOverride(key, guildId);
    if (override) return override.enabled;
  }

  const flag = await container.db.featureFlags.getFlagForEvaluation(key);
  if (!flag || !flag.enabled) return false;
  if (flag.rolloutPercent >= 100) return true;
  if (flag.rolloutPercent <= 0) return false;

  return rolloutBucket(key, guildId ?? null) < flag.rolloutPercent;
}
