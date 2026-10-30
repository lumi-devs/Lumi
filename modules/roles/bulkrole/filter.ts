export type BulkRoleFilterMode =
  | "all"
  | "has_roles"
  | "missing_roles"
  | "joined_before"
  | "joined_after"
  | "only_humans"
  | "only_bots";

export const BulkRoleFilterModes: readonly BulkRoleFilterMode[] = [
  "all",
  "has_roles",
  "missing_roles",
  "joined_before",
  "joined_after",
  "only_humans",
  "only_bots",
];

export interface BulkRoleFilter {
  readonly mode: BulkRoleFilterMode;
  readonly roleIds: readonly string[];
  readonly before: string | null;
  readonly after: string | null;
}

export interface BulkCandidate {
  readonly isBot: boolean;
  readonly roleIds: readonly string[];
  readonly joinedAtMs: number;
}

export type BulkRoleAction = "add" | "remove";
export type BulkRoleChange = BulkRoleAction | "skip";

export function isBulkRoleFilterMode(
  value: unknown,
): value is BulkRoleFilterMode {
  return (
    typeof value === "string" &&
    (BulkRoleFilterModes as readonly string[]).includes(value)
  );
}

export function normalizeBulkFilter(value: unknown): BulkRoleFilter {
  const source =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : {};
  const mode = isBulkRoleFilterMode(source.mode) ? source.mode : "all";
  const roleIds = Array.isArray(source.roleIds)
    ? [
        ...new Set(
          source.roleIds.filter((id): id is string => typeof id === "string"),
        ),
      ]
    : [];
  const before = typeof source.before === "string" ? source.before : null;
  const after = typeof source.after === "string" ? source.after : null;
  return { mode, roleIds, before, after };
}

export function parseFilterDate(value: string | null): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export function matchesBulkFilter(
  candidate: BulkCandidate,
  filter: BulkRoleFilter,
): boolean {
  switch (filter.mode) {
    case "all":
      return true;
    case "only_humans":
      return !candidate.isBot;
    case "only_bots":
      return candidate.isBot;
    case "has_roles":
      return filter.roleIds.some((roleId) =>
        candidate.roleIds.includes(roleId),
      );
    case "missing_roles":
      return filter.roleIds.every(
        (roleId) => !candidate.roleIds.includes(roleId),
      );
    case "joined_before": {
      const before = parseFilterDate(filter.before);
      return before !== null && candidate.joinedAtMs < before;
    }
    case "joined_after": {
      const after = parseFilterDate(filter.after);
      return after !== null && candidate.joinedAtMs > after;
    }
    default:
      return false;
  }
}

export function selectBulkMatches<T extends BulkCandidate>(
  candidates: readonly T[],
  filter: BulkRoleFilter,
): T[] {
  return candidates.filter((candidate) => matchesBulkFilter(candidate, filter));
}

export function countBulkMatches(
  candidates: readonly BulkCandidate[],
  filter: BulkRoleFilter,
): number {
  return selectBulkMatches(candidates, filter).length;
}

export function planBulkRoleChange(
  action: BulkRoleAction,
  roleId: string,
  candidate: BulkCandidate,
): BulkRoleChange {
  const hasRole = candidate.roleIds.includes(roleId);
  if (action === "add") return hasRole ? "skip" : "add";
  return hasRole ? "remove" : "skip";
}

export function selectBulkRoleChanges<T extends BulkCandidate>(
  candidates: readonly T[],
  filter: BulkRoleFilter,
  action: BulkRoleAction,
  roleId: string,
): Array<{ candidate: T; change: BulkRoleAction }> {
  const changes: Array<{ candidate: T; change: BulkRoleAction }> = [];
  for (const candidate of selectBulkMatches(candidates, filter)) {
    const change = planBulkRoleChange(action, roleId, candidate);
    if (change === "skip") continue;
    changes.push({ candidate, change });
  }
  return changes;
}

export function countBulkRoleChanges(
  candidates: readonly BulkCandidate[],
  filter: BulkRoleFilter,
  action: BulkRoleAction,
  roleId: string,
): number {
  return selectBulkRoleChanges(candidates, filter, action, roleId).length;
}
