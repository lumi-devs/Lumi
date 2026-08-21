import { describe, it, expect } from "vitest";
import { memberRoleIds } from "#lib/permissions/preconditions/RequirePermit.js";

function fakeRoleCache(roles: Array<{ id: string; position: number }>): Map<string, { position: number }> {
  const map = new Map<string, { position: number }>();
  for (const r of roles) map.set(r.id, { position: r.position });
  return map;
}

describe("memberRoleIds", () => {
  it("sorts a real role Collection highest position first", () => {
    const member = {
      roles: {
        cache: fakeRoleCache([
          { id: "G1", position: 0 }, // @everyone
          { id: "R_LOW", position: 1 },
          { id: "R_HIGH", position: 5 },
          { id: "R_MID", position: 3 },
        ]),
      },
    };
    expect(memberRoleIds(member)).toEqual(["R_HIGH", "R_MID", "R_LOW", "G1"]);
  });

  it("keeps the @everyone role (id === guildId) as a real, sortable target - it's a legitimate independently-assignable custom-permit target, not a pseudo-entry to strip", () => {
    const member = {
      roles: { cache: fakeRoleCache([{ id: "G1", position: 0 }, { id: "R1", position: 1 }]) },
    };
    expect(memberRoleIds(member)).toEqual(["R1", "G1"]);
  });

  it("falls back to unsorted, unfiltered order for a raw ID array (no position data available)", () => {
    const member = { roles: ["G1", "R1", "R2"] };
    expect(memberRoleIds(member)).toEqual(["G1", "R1", "R2"]);
  });

  it("returns an empty array for a nullish/non-object member", () => {
    expect(memberRoleIds(null)).toEqual([]);
    expect(memberRoleIds(undefined)).toEqual([]);
  });
});
