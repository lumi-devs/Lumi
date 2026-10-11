import type { Container } from "#src/lib/Services.js";
import { rolloutBucket } from "#src/lib/feature-flags/Hash.js";

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
