export function uniquePermitName(
  existingNames: Iterable<string>,
  base: string,
): string {
  const names = new Set(existingNames);
  const trimmed = base.slice(0, 60);
  if (!names.has(trimmed)) return trimmed;
  let suffix = 2;
  while (names.has(`${trimmed} ${suffix}`)) suffix += 1;
  return `${trimmed} ${suffix}`;
}
