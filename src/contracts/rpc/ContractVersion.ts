import semver from "semver";
import { MIN_COMPATIBLE_CONTRACT_VERSION } from "#src/contracts/Version.js";

export interface ContractCompatibilityOptions {

  minVersion?: string;

  range?: string;
}

function normalizeVersion(v: string): string | null {
  const parsed = semver.valid(v);
  if (parsed) return parsed;
  return semver.coerce(v)?.version ?? null;
}

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
