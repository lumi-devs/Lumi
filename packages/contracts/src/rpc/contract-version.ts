/**
 * Parses the `major.minor` prefix of a semver string (ignoring prerelease/
 * build metadata after the patch number, e.g. `0.5.0-next.0` -> `{0, 5}`).
 * Returns `null` for anything that doesn't start with `N.N.N`.
 */
function parseMajorMinor(version: string): { major: number; minor: number } | null {
  const match = /^(\d+)\.(\d+)\.\d+/.exec(version);
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]) };
}

/**
 * Whether a caller built against `theirVersion` of `@lumi/contracts` can
 * safely talk to a server built against `ourVersion`.
 *
 * Majors must match (standard semver compatibility). While the major is
 * still `0` — pre-1.0, no stability guarantee across minors — the minor must
 * match too, since a `0.x` bump is allowed to be breaking.
 *
 * Either string failing to parse as `major.minor.patch` is treated as
 * incompatible: a malformed version is not something to guess about.
 */
export function contractVersionsCompatible(
  ourVersion: string,
  theirVersion: string,
): boolean {
  const ours = parseMajorMinor(ourVersion);
  const theirs = parseMajorMinor(theirVersion);
  if (!ours || !theirs) return false;
  if (ours.major !== theirs.major) return false;
  if (ours.major === 0 && ours.minor !== theirs.minor) return false;
  return true;
}
