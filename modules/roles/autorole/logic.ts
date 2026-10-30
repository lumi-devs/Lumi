export interface AutoroleFilterSettings {
  readonly enabled: boolean;
  readonly paused: boolean;
  readonly roleIds: readonly string[];
  readonly minAccountAgeHours: number;
  readonly requiredRoleIds: readonly string[];
  readonly ignoredRoleIds: readonly string[];
  readonly ignoreBots: boolean;
  readonly onlyOnJoin: boolean;
}

export interface AutoroleCandidate {
  readonly isBot: boolean;
  readonly accountAgeMs: number;
  readonly roleIds: readonly string[];
  readonly isJoin: boolean;
}

export type AutoroleDecision =
  | { readonly eligible: true }
  | { readonly eligible: false; readonly reason: string };

export function selectRolesToAssign(
  configuredRoleIds: readonly string[],
  memberRoleIds: readonly string[],
): string[] {
  const existing = new Set(memberRoleIds);
  return [...new Set(configuredRoleIds)].filter(
    (roleId) => !existing.has(roleId),
  );
}

export function evaluateAutoroleCandidate(
  candidate: AutoroleCandidate,
  settings: AutoroleFilterSettings,
): AutoroleDecision {
  if (!settings.enabled) {
    return { eligible: false, reason: "autorole is disabled" };
  }
  if (settings.paused) {
    return { eligible: false, reason: "autorole is paused" };
  }
  if (settings.roleIds.length === 0) {
    return { eligible: false, reason: "no autoroles configured" };
  }
  if (settings.ignoreBots && candidate.isBot) {
    return { eligible: false, reason: "bots are ignored" };
  }
  if (settings.onlyOnJoin && !candidate.isJoin) {
    return { eligible: false, reason: "only applies on join" };
  }
  if (
    settings.minAccountAgeHours > 0 &&
    candidate.accountAgeMs < settings.minAccountAgeHours * 3_600_000
  ) {
    return { eligible: false, reason: "account is too new" };
  }
  if (
    settings.ignoredRoleIds.some((roleId) => candidate.roleIds.includes(roleId))
  ) {
    return { eligible: false, reason: "member has an ignored role" };
  }
  if (
    settings.requiredRoleIds.length > 0 &&
    !settings.requiredRoleIds.some((roleId) =>
      candidate.roleIds.includes(roleId),
    )
  ) {
    return { eligible: false, reason: "member lacks a required role" };
  }
  return { eligible: true };
}

export function resolveAssignAt(nowMs: number, delaySeconds: number): Date {
  return new Date(nowMs + Math.max(0, delaySeconds) * 1000);
}

export function isPendingDue(
  assignAt: Date | string | number,
  nowMs: number,
): boolean {
  const value =
    assignAt instanceof Date
      ? assignAt.getTime()
      : typeof assignAt === "number"
        ? assignAt
        : new Date(assignAt).getTime();
  return Number.isFinite(value) && value <= nowMs;
}

export function selectDuePending<
  T extends { assignAt: Date | string | number },
>(pending: readonly T[], nowMs: number): T[] {
  return pending.filter((row) => isPendingDue(row.assignAt, nowMs));
}

export function mergePendingRoleIds(
  existingRoleIds: readonly string[],
  nextRoleIds: readonly string[],
): string[] {
  return [...new Set([...existingRoleIds, ...nextRoleIds])];
}

export function choosePendingAssignAt(
  existingAssignAt: Date,
  nextAssignAt: Date,
): Date {
  return existingAssignAt.getTime() <= nextAssignAt.getTime()
    ? existingAssignAt
    : nextAssignAt;
}
