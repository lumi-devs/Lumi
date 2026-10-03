const FnvOffsetBasis = 0x811c9dc5;
const FnvPrime = 0x01000193;

/**
 * FNV-1a over a UTF-16 code-unit string, returned as an unsigned 32-bit int.
 * Not cryptographic - only used to deterministically bucket a (flag, guild)
 * pair into [0, 100) for percentage rollout, so the same pair always lands
 * in the same bucket across processes without any shared state.
 */
export function fnv1aHash(input: string): number {
  let hash = FnvOffsetBasis;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, FnvPrime);
  }
  return hash >>> 0;
}

/** Stable bucket in [0, 100) for a flag key scoped to a guild (or the "global" subject). */
export function rolloutBucket(key: string, guildId: string | null): number {
  return fnv1aHash(`${key}:${guildId ?? "global"}`) % 100;
}
