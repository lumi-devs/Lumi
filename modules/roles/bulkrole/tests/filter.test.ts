import { describe, expect, it } from "vitest";
import {
  countBulkMatches,
  countBulkRoleChanges,
  matchesBulkFilter,
  normalizeBulkFilter,
  planBulkRoleChange,
  selectBulkMatches,
  selectBulkRoleChanges,
  type BulkCandidate,
  type BulkRoleFilter,
} from "../filter.js";

const candidates: BulkCandidate[] = [
  { isBot: false, roleIds: ["a"], joinedAtMs: 1_000 },
  { isBot: false, roleIds: ["b"], joinedAtMs: 5_000 },
  { isBot: true, roleIds: ["a", "b"], joinedAtMs: 9_000 },
];

const filter = (
  mode: BulkRoleFilter["mode"],
  overrides: Partial<BulkRoleFilter> = {},
): BulkRoleFilter => ({
  mode,
  roleIds: [],
  before: null,
  after: null,
  ...overrides,
});

describe("bulk role filters", () => {
  it("matches all members", () => {
    expect(countBulkMatches(candidates, filter("all"))).toBe(3);
  });

  it("matches humans and bots", () => {
    expect(countBulkMatches(candidates, filter("only_humans"))).toBe(2);
    expect(countBulkMatches(candidates, filter("only_bots"))).toBe(1);
  });

  it("matches any listed role for has_roles", () => {
    expect(
      selectBulkMatches(candidates, filter("has_roles", { roleIds: ["b"] }))
        .length,
    ).toBe(2);
  });

  it("matches members missing every listed role", () => {
    expect(
      selectBulkMatches(candidates, filter("missing_roles", { roleIds: ["a"] }))
        .length,
    ).toBe(1);
    expect(
      selectBulkMatches(
        candidates,
        filter("missing_roles", { roleIds: ["a", "b"] }),
      ).length,
    ).toBe(0);
  });

  it("matches join date windows", () => {
    expect(
      countBulkMatches(
        candidates,
        filter("joined_before", { before: "1970-01-01T00:00:05.000Z" }),
      ),
    ).toBe(1);
    expect(
      countBulkMatches(
        candidates,
        filter("joined_after", { after: "1970-01-01T00:00:05.000Z" }),
      ),
    ).toBe(1);
  });

  it("rejects invalid dates", () => {
    expect(
      matchesBulkFilter(
        candidates[0]!,
        filter("joined_before", { before: "not-a-date" }),
      ),
    ).toBe(false);
  });

  it("normalizes stored filters and deduplicates role IDs", () => {
    expect(
      normalizeBulkFilter({
        mode: "has_roles",
        roleIds: ["a", "a", 5],
        before: null,
        after: 4,
      }),
    ).toEqual({
      mode: "has_roles",
      roleIds: ["a"],
      before: null,
      after: null,
    });
    expect(normalizeBulkFilter({ mode: "unknown" }).mode).toBe("all");
  });
});

describe("bulk role dry-run counts and change planning", () => {
  it("plans add and remove changes from current role state", () => {
    expect(planBulkRoleChange("add", "a", candidates[0]!)).toBe("skip");
    expect(planBulkRoleChange("add", "c", candidates[0]!)).toBe("add");
    expect(planBulkRoleChange("remove", "a", candidates[0]!)).toBe("remove");
    expect(planBulkRoleChange("remove", "c", candidates[0]!)).toBe("skip");
  });

  it("counts only members that need a change", () => {
    const hasAny = filter("has_roles", { roleIds: ["a", "b"] });
    expect(countBulkMatches(candidates, hasAny)).toBe(3);
    expect(countBulkRoleChanges(candidates, hasAny, "add", "c")).toBe(3);
    expect(countBulkRoleChanges(candidates, hasAny, "remove", "b")).toBe(2);
  });

  it("produces a stable change preview list", () => {
    const changes = selectBulkRoleChanges(
      candidates,
      filter("only_humans"),
      "add",
      "a",
    );
    expect(changes.map((entry) => entry.candidate.joinedAtMs)).toEqual([5_000]);
    expect(changes[0]!.change).toBe("add");
  });
});
