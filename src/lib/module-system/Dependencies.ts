import semver from "semver";

export const ModuleNameRegex = /^[a-z0-9][a-z0-9-]*$/;

export interface ParsedDependency {
  name: string;

  range: string | null;
}

export function parseDependencySpec(entry: string): ParsedDependency {
  const at = entry.lastIndexOf("@");
  if (at <= 0) return { name: entry, range: null };
  return { name: entry.slice(0, at), range: entry.slice(at + 1) };
}

export function isValidDependencySpec(entry: string): boolean {
  const { name, range } = parseDependencySpec(entry);
  if (!ModuleNameRegex.test(name)) return false;
  if (range !== null && !semver.validRange(range)) return false;
  return true;
}

export function isDependencySatisfied(
  range: string | null,
  installedVersion: string,
): boolean {
  if (range === null) return true;
  return semver.satisfies(installedVersion, range, { includePrerelease: true });
}
