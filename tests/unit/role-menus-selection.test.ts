import { describe, expect, it } from "vitest";
import { MaxTempDurationSeconds } from "../../modules/role-menus/config.ts";
import {
  isTempRoleExpired,
  planForcedRemoval,
  planSelection,
  tempRoleExpiry,
  type RoleMenuRules,
} from "../../modules/role-menus/menu/selection.ts";

function rules(overrides: Partial<RoleMenuRules> = {}): RoleMenuRules {
  return {
    mode: "multiple",
    requireOne: false,
    autoToggle: true,
    maxSelections: null,
    optionRoleIds: ["a", "b", "c", "d"],
    ...overrides,
  };
}

describe("role menu selection", () => {
  it("adds a role in multiple mode", () => {
    const result = planSelection({
      rules: rules(),
      currentRoleIds: ["a"],
      requestedRoleIds: ["b"],
    });

    expect(result).toEqual({
      ok: true,
      addRoleIds: ["b"],
      removeRoleIds: [],
      selectedRoleIds: ["a", "b"],
      changed: true,
    });
  });

  it("toggles a held role off when auto-toggle is enabled", () => {
    const result = planSelection({
      rules: rules(),
      currentRoleIds: ["a", "b"],
      requestedRoleIds: ["a"],
    });

    expect(result).toMatchObject({
      ok: true,
      addRoleIds: [],
      removeRoleIds: ["a"],
      selectedRoleIds: ["b"],
      changed: true,
    });
  });

  it("keeps a held role when auto-toggle is disabled", () => {
    const result = planSelection({
      rules: rules({ autoToggle: false }),
      currentRoleIds: ["a"],
      requestedRoleIds: ["a"],
    });

    expect(result).toMatchObject({
      ok: true,
      addRoleIds: [],
      removeRoleIds: [],
      selectedRoleIds: ["a"],
      changed: false,
    });
  });

  it("replaces the current role in single mode", () => {
    const result = planSelection({
      rules: rules({ mode: "single" }),
      currentRoleIds: ["a"],
      requestedRoleIds: ["c"],
    });

    expect(result).toMatchObject({
      ok: true,
      addRoleIds: ["c"],
      removeRoleIds: ["a"],
      selectedRoleIds: ["c"],
    });
  });

  it("removes the held role in single mode when auto-toggle is enabled", () => {
    const result = planSelection({
      rules: rules({ mode: "single" }),
      currentRoleIds: ["a"],
      requestedRoleIds: ["a"],
    });

    expect(result).toMatchObject({
      ok: true,
      addRoleIds: [],
      removeRoleIds: ["a"],
      selectedRoleIds: [],
    });
  });

  it("rejects a selection above the maximum", () => {
    const result = planSelection({
      rules: rules({ maxSelections: 2 }),
      currentRoleIds: ["a", "b"],
      requestedRoleIds: ["c"],
    });

    expect(result).toEqual({
      ok: false,
      code: "max-selections",
      message: "This role menu allows at most 2 selections.",
    });
  });

  it("allows a selection that frees capacity through auto-toggle", () => {
    const result = planSelection({
      rules: rules({ maxSelections: 2 }),
      currentRoleIds: ["a", "b"],
      requestedRoleIds: ["a", "c"],
    });

    expect(result).toMatchObject({
      ok: true,
      addRoleIds: ["c"],
      removeRoleIds: ["a"],
      selectedRoleIds: ["b", "c"],
    });
  });

  it("rejects removing the last role when one is required", () => {
    const result = planSelection({
      rules: rules({ requireOne: true }),
      currentRoleIds: ["a"],
      requestedRoleIds: ["a"],
    });

    expect(result).toEqual({
      ok: false,
      code: "require-one",
      message: "You must keep at least one role from this menu.",
    });
  });

  it("allows swapping the last role in single mode when one is required", () => {
    const result = planSelection({
      rules: rules({ mode: "single", requireOne: true }),
      currentRoleIds: ["a"],
      requestedRoleIds: ["b"],
    });

    expect(result).toMatchObject({
      ok: true,
      addRoleIds: ["b"],
      removeRoleIds: ["a"],
      selectedRoleIds: ["b"],
    });
  });

  it("forces removal for reaction menus while honoring require-one", () => {
    const removed = planForcedRemoval(rules(), ["a", "b"], "a");
    expect(removed).toMatchObject({
      ok: true,
      removeRoleIds: ["a"],
      selectedRoleIds: ["b"],
    });

    const rejected = planForcedRemoval(rules({ requireOne: true }), ["a"], "a");
    expect(rejected).toMatchObject({ ok: false, code: "require-one" });
  });

  it("computes temporary role expiry", () => {
    const now = new Date("2026-10-30T12:00:00.000Z");
    expect(tempRoleExpiry(now, 90)?.toISOString()).toBe(
      "2026-10-30T12:01:30.000Z",
    );
    expect(tempRoleExpiry(now, 0)).toBeNull();
    expect(tempRoleExpiry(now, null)).toBeNull();
  });

  it("caps temporary roles at 30 days", () => {
    const now = new Date("2026-10-30T12:00:00.000Z");
    const expiry = tempRoleExpiry(now, MaxTempDurationSeconds + 5000);
    expect(expiry?.getTime()).toBe(
      now.getTime() + MaxTempDurationSeconds * 1000,
    );
  });

  it("detects expired temporary roles", () => {
    const now = new Date("2026-10-30T12:00:00.000Z");
    expect(isTempRoleExpired(new Date("2026-10-30T11:59:59.000Z"), now)).toBe(
      true,
    );
    expect(isTempRoleExpired(new Date("2026-10-30T12:00:01.000Z"), now)).toBe(
      false,
    );
  });
});
