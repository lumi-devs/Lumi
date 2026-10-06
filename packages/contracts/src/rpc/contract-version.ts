import semver from "semver";
import { MIN_COMPATIBLE_CONTRACT_VERSION } from "../version.js";

export interface ContractCompatibilityOptions {
  /** Minimum contract version accepted from callers. Defaults to MIN_COMPATIBLE_CONTRACT_VERSION. */
  minVersion?: string;
  /** Explicit semver range for compatibility. Overrides minVersion if provided. */
  range?: string;
}

function normalizeVersion(v: string): string | null {
  return semver.valid(v) ?? (semver.valid(semver.coerce(v)) ? semver.coerce(v)?.version ?? null : null);
}

/**
 * Whether a caller built against `theirVersion` of `@lumi/contracts` can
 * safely talk to a server built against `ourVersion`.
 *
 * Modeled after npm's peerDependencies and engine range resolution:
 * 1. Differing major versions are always incompatible (breaking changes).
 * 2. Pre-1.0 (0.x): callers within the backwards-compatible floor
 *    (`minVersion`, defaults to `MIN_COMPATIBLE_CONTRACT_VERSION`) up to `ourVersion`
 *    are accepted.
 * 3. Post-1.0 (>= 1.0.0): callers with matching major and minor <= ourVersion are accepted
 *    (additive minor features are backwards-compatible).
 * 4. Callers sending semver ranges (e.g. `^0.6.0`, `>=0.6.0`) are evaluated via
 *    `semver.intersects()`.
 * 5. Same major.minor (even with different patch versions or prerelease tags like
 *    `0.5.0-next.0` vs `0.5.0-next.3`) are compatible.
 */
export function contractVersionsCompatible(
  ourVersion: string,
  theirVersion: string,
  options?: ContractCompatibilityOptions,
): boolean {
  if (ourVersion === theirVersion) return true;

  const validOur = normalizeVersion(ourVersion);
  if (!validOur) return false;

  const minSupported = options?.minVersion ?? MIN_COMPATIBLE_CONTRACT_VERSION;
  const supportedMin = normalizeVersion(minSupported) ?? minSupported;
  const effectiveRange = options?.range ?? `>=${supportedMin} <=${validOur}`;

  if (semver.validRange(theirVersion) && !semver.valid(theirVersion)) {
    return semver.intersects(theirVersion, effectiveRange, { includePrerelease: true });
  }

  const validTheir = normalizeVersion(theirVersion);
  if (!validTheir) return false;

  const ourMajor = semver.major(validOur);
  const theirMajor = semver.major(validTheir);
  const ourMinor = semver.minor(validOur);
  const theirMinor = semver.minor(validTheir);

  if (ourMajor !== theirMajor) return false;

  if (ourMinor === theirMinor) return true;

  if (ourMajor >= 1) {
    return theirMinor <= ourMinor;
  }

  return semver.satisfies(validTheir, effectiveRange, { includePrerelease: true });
}
