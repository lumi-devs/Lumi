import { MaxTempDurationSeconds } from "../config.js";

export type RoleMenuMode = "single" | "multiple";

export interface RoleMenuRules {
  readonly mode: RoleMenuMode;
  readonly requireOne: boolean;
  readonly autoToggle: boolean;
  readonly maxSelections: number | null;
  readonly optionRoleIds: readonly string[];
}

export interface SelectionRequest {
  readonly rules: RoleMenuRules;
  readonly currentRoleIds: readonly string[];
  readonly requestedRoleIds: readonly string[];
}

export type SelectionFailureCode =
  "max-selections" | "require-one" | "no-options";

export type SelectionResult =
  | {
      readonly ok: true;
      readonly addRoleIds: readonly string[];
      readonly removeRoleIds: readonly string[];
      readonly selectedRoleIds: readonly string[];
      readonly changed: boolean;
    }
  | {
      readonly ok: false;
      readonly code: SelectionFailureCode;
      readonly message: string;
    };

function unique(values: readonly string[]): string[] {
  return Array.from(new Set(values));
}

function selectionLimit(rules: RoleMenuRules): number | null {
  if (rules.mode === "single") return 1;
  return rules.maxSelections && rules.maxSelections > 0
    ? rules.maxSelections
    : null;
}

export function planSelection(input: SelectionRequest): SelectionResult {
  const options = new Set(input.rules.optionRoleIds);
  if (options.size === 0) {
    return {
      ok: false,
      code: "no-options",
      message: "This role menu has no options.",
    };
  }

  const current = new Set(
    unique(input.currentRoleIds).filter((roleId) => options.has(roleId)),
  );
  const requested = unique(input.requestedRoleIds).filter((roleId) =>
    options.has(roleId),
  );

  let selected: Set<string>;
  if (input.rules.mode === "single") {
    selected = new Set(current);
    for (const roleId of requested) {
      if (selected.has(roleId)) {
        if (input.rules.autoToggle) selected.delete(roleId);
        continue;
      }
      selected = new Set([roleId]);
    }
  } else {
    const removals = new Set(
      input.rules.autoToggle
        ? requested.filter((roleId) => current.has(roleId))
        : [],
    );
    selected = new Set([...current].filter((roleId) => !removals.has(roleId)));
    for (const roleId of requested) {
      if (removals.has(roleId)) continue;
      if (selected.has(roleId)) continue;
      selected.add(roleId);
    }

    const limit = selectionLimit(input.rules);
    if (limit !== null && selected.size > limit) {
      return {
        ok: false,
        code: "max-selections",
        message: `This role menu allows at most ${limit} selection${limit === 1 ? "" : "s"}.`,
      };
    }
  }

  if (input.rules.requireOne && selected.size === 0) {
    return {
      ok: false,
      code: "require-one",
      message: "You must keep at least one role from this menu.",
    };
  }

  const addRoleIds = [...selected].filter((roleId) => !current.has(roleId));
  const removeRoleIds = [...current].filter((roleId) => !selected.has(roleId));

  return {
    ok: true,
    addRoleIds,
    removeRoleIds,
    selectedRoleIds: [...selected],
    changed: addRoleIds.length > 0 || removeRoleIds.length > 0,
  };
}

export function planForcedRemoval(
  rules: RoleMenuRules,
  currentRoleIds: readonly string[],
  roleId: string,
): SelectionResult {
  const options = new Set(rules.optionRoleIds);
  const current = new Set(currentRoleIds.filter((id) => options.has(id)));
  if (!current.has(roleId)) {
    return {
      ok: true,
      addRoleIds: [],
      removeRoleIds: [],
      selectedRoleIds: [...current],
      changed: false,
    };
  }

  const selected = new Set(current);
  selected.delete(roleId);
  if (rules.requireOne && selected.size === 0) {
    return {
      ok: false,
      code: "require-one",
      message: "You must keep at least one role from this menu.",
    };
  }

  return {
    ok: true,
    addRoleIds: [],
    removeRoleIds: [roleId],
    selectedRoleIds: [...selected],
    changed: true,
  };
}

export function tempRoleExpiry(
  now: Date,
  durationSeconds: number | null | undefined,
): Date | null {
  if (!durationSeconds || durationSeconds <= 0) return null;
  const bounded = Math.min(Math.floor(durationSeconds), MaxTempDurationSeconds);
  return new Date(now.getTime() + bounded * 1000);
}

export function isTempRoleExpired(expiresAt: Date, now: Date): boolean {
  return expiresAt.getTime() <= now.getTime();
}

export function formatTempDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return "Permanent";
  const safe = Math.min(Math.floor(seconds), MaxTempDurationSeconds);
  const days = Math.floor(safe / 86_400);
  const hours = Math.floor((safe % 86_400) / 3_600);
  const minutes = Math.floor((safe % 3_600) / 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 && days === 0) parts.push(`${minutes}m`);
  if (parts.length === 0) parts.push(`${safe}s`);
  return parts.join(" ");
}
