import type { Container } from "#src/lib/Services.js";

const FnvOffsetBasis = 0x811c9dc5;
const FnvPrime = 0x01000193;

export function fnv1aHash(input: string): number {
  let hash = FnvOffsetBasis;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, FnvPrime);
  }
  return hash >>> 0;
}

export function rolloutBucket(key: string, guildId: string | null): number {
  return fnv1aHash(`${key}:${guildId ?? "global"}`) % 100;
}

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
