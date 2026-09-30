import semver from "semver";

/** Module name grammar shared by info.json/manifest.json validation. */
export const ModuleNameRegex = /^[a-z0-9][a-z0-9-]*$/;

export interface ParsedDependency {
  name: string;
  /** `null` for a plain `"name"` entry with no version constraint. */
  range: string | null;
}

/**
 * Splits a `dependencies` entry into its module name and optional semver
 * range: `"economy"` -> `{ name: "economy", range: null }`, and
 * `"leveling@^1.2.0"` -> `{ name: "leveling", range: "^1.2.0" }`. Module
 * names can never contain `@` (see {@link ModuleNameRegex}), so splitting on
 * the last `@` is unambiguous. An entry with a leading `@` (index 0) has no
 * valid name half and is returned whole, so the caller's name-format check
 * reports it.
 */
export function parseDependencySpec(entry: string): ParsedDependency {
  const at = entry.lastIndexOf("@");
  if (at <= 0) return { name: entry, range: null };
  return { name: entry.slice(0, at), range: entry.slice(at + 1) };
}

/** True when `entry` is a syntactically valid `name` or `name@range` dependency spec. */
export function isValidDependencySpec(entry: string): boolean {
  const { name, range } = parseDependencySpec(entry);
  if (!ModuleNameRegex.test(name)) return false;
  if (range !== null && !semver.validRange(range)) return false;
  return true;
}

/**
 * Whether an installed dependency's version satisfies a declared range.
 * A `null` range (plain `"name"` dependency) is satisfied by presence alone.
 * Pre-release versions are allowed to satisfy the range (`includePrerelease`)
 * since addon versions are author-controlled, not npm-published semver.
 */
export function isDependencySatisfied(
  range: string | null,
  installedVersion: string,
): boolean {
  if (range === null) return true;
  return semver.satisfies(installedVersion, range, { includePrerelease: true });
}
