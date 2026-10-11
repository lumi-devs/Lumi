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
