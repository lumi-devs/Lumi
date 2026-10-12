export const DidYouMeanLimit = 3;

export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
  let next: number[] = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    next[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      next[j] = Math.min(prev[j]! + 1, next[j - 1]! + 1, prev[j - 1]! + cost);
    }
    [prev, next] = [next, prev];
  }
  return prev[b.length]!;
}

export function suggestSimilar(
  input: string,
  names: readonly string[],
  limit: number = DidYouMeanLimit,
): string[] {
  const needle = input.toLowerCase().trim();
  if (!needle || limit <= 0) return [];
  const maxDistance = needle.length <= 3 ? 1 : needle.length <= 5 ? 2 : 3;
  const seen = new Set<string>();
  const scored: { name: string; distance: number }[] = [];
  for (const raw of names) {
    const name = raw.toLowerCase();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const prefixBonus = name.startsWith(needle) || needle.startsWith(name) ? 1 : 0;
    const distance = editDistance(needle, name) - prefixBonus;
    if (distance > maxDistance) continue;
    if (needle.length <= 3 && name[0] !== needle[0]) continue;
    scored.push({ name: raw, distance });
  }
  scored.sort((x, y) => x.distance - y.distance || x.name.localeCompare(y.name));
  return scored.slice(0, limit).map((s) => s.name);
}

export function didYouMean(input: string, names: readonly string[]): string | null {
  return suggestSimilar(input, names, 1)[0] ?? null;
}
