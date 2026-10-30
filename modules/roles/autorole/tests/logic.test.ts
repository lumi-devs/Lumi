import { describe, expect, it } from "vitest";
import {
  choosePendingAssignAt,
  evaluateAutoroleCandidate,
  isPendingDue,
  mergePendingRoleIds,
  resolveAssignAt,
  selectDuePending,
  selectRolesToAssign,
  type AutoroleFilterSettings,
} from "../logic.js";

const base: AutoroleFilterSettings = {
  enabled: true,
  paused: false,
  roleIds: ["role-a"],
  minAccountAgeHours: 0,
  requiredRoleIds: [],
  ignoredRoleIds: [],
  ignoreBots: true,
  onlyOnJoin: true,
};

const dayMs = 24 * 3_600_000;

describe("autorole filters", () => {
  it("assigns only configured roles the member does not already have", () => {
    expect(
      selectRolesToAssign(["role-a", "role-b", "role-a"], ["role-b"]),
    ).toEqual(["role-a"]);
  });

  it("rejects bots when ignoreBots is enabled", () => {
    const decision = evaluateAutoroleCandidate(
      { isBot: true, accountAgeMs: 30 * dayMs, roleIds: [], isJoin: true },
      base,
    );
    expect(decision).toEqual({
      eligible: false,
      reason: "bots are ignored",
    });
  });

  it("allows bots when ignoreBots is disabled", () => {
    const decision = evaluateAutoroleCandidate(
      { isBot: true, accountAgeMs: 30 * dayMs, roleIds: [], isJoin: true },
      { ...base, ignoreBots: false },
    );
    expect(decision.eligible).toBe(true);
  });

  it("rejects accounts younger than the minimum age", () => {
    const decision = evaluateAutoroleCandidate(
      {
        isBot: false,
        accountAgeMs: 2 * 3_600_000,
        roleIds: [],
        isJoin: true,
      },
      { ...base, minAccountAgeHours: 24 },
    );
    expect(decision).toEqual({
      eligible: false,
      reason: "account is too new",
    });
  });

  it("requires at least one of the required roles", () => {
    const settings = {
      ...base,
      requiredRoleIds: ["role-x", "role-y"],
    };
    expect(
      evaluateAutoroleCandidate(
        {
          isBot: false,
          accountAgeMs: 30 * dayMs,
          roleIds: ["role-z"],
          isJoin: true,
        },
        settings,
      ).eligible,
    ).toBe(false);
    expect(
      evaluateAutoroleCandidate(
        {
          isBot: false,
          accountAgeMs: 30 * dayMs,
          roleIds: ["role-y"],
          isJoin: true,
        },
        settings,
      ).eligible,
    ).toBe(true);
  });

  it("rejects ignored roles", () => {
    const decision = evaluateAutoroleCandidate(
      {
        isBot: false,
        accountAgeMs: 30 * dayMs,
        roleIds: ["role-ignore"],
        isJoin: true,
      },
      { ...base, ignoredRoleIds: ["role-ignore"] },
    );
    expect(decision).toEqual({
      eligible: false,
      reason: "member has an ignored role",
    });
  });

  it("only on join rejects manual runs but accepts joins", () => {
    const candidate = {
      isBot: false,
      accountAgeMs: 30 * dayMs,
      roleIds: [],
    };
    expect(
      evaluateAutoroleCandidate({ ...candidate, isJoin: false }, base).eligible,
    ).toBe(false);
    expect(
      evaluateAutoroleCandidate({ ...candidate, isJoin: true }, base).eligible,
    ).toBe(true);
  });

  it("rejects disabled, paused, and unconfigured states", () => {
    const candidate = {
      isBot: false,
      accountAgeMs: 30 * dayMs,
      roleIds: [],
      isJoin: true,
    };
    expect(
      evaluateAutoroleCandidate(candidate, { ...base, enabled: false })
        .eligible,
    ).toBe(false);
    expect(
      evaluateAutoroleCandidate(candidate, { ...base, paused: true }).eligible,
    ).toBe(false);
    expect(
      evaluateAutoroleCandidate(candidate, { ...base, roleIds: [] }).eligible,
    ).toBe(false);
  });
});

describe("autorole delay and pending selection", () => {
  it("computes the assignment time from the delay", () => {
    expect(resolveAssignAt(1_000, 30).getTime()).toBe(31_000);
    expect(resolveAssignAt(1_000, 0).getTime()).toBe(1_000);
    expect(resolveAssignAt(1_000, -5).getTime()).toBe(1_000);
  });

  it("selects only pending rows whose assignment time has arrived", () => {
    const rows = [
      { id: "a", assignAt: new Date(1_000) },
      { id: "b", assignAt: new Date(5_000) },
      { id: "c", assignAt: "1970-01-01T00:00:00.500Z" },
    ];
    expect(isPendingDue(rows[0]!.assignAt, 2_000)).toBe(true);
    expect(isPendingDue(rows[1]!.assignAt, 2_000)).toBe(false);
    expect(selectDuePending(rows, 2_000).map((row) => row.id)).toEqual([
      "a",
      "c",
    ]);
  });

  it("merges queued roles and keeps the earliest assignment time", () => {
    expect(mergePendingRoleIds(["a", "b"], ["b", "c"])).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(
      choosePendingAssignAt(new Date(2_000), new Date(1_000)).getTime(),
    ).toBe(1_000);
    expect(
      choosePendingAssignAt(new Date(1_000), new Date(2_000)).getTime(),
    ).toBe(1_000);
  });
});
