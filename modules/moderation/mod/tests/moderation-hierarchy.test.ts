import { describe, expect, it } from "vitest";
import { canActOnRanks, type RankedActor } from "../helpers.js";

const ownerId = "owner";

function actor(id: string, highestRolePosition: number): RankedActor {
  return { id, highestRolePosition };
}

function target(id: string, highestRolePosition: number) {
  return { id, highestRolePosition };
}

describe("moderation hierarchy", () => {
  it("allows the guild owner to act on higher roles", () => {
    expect(
      canActOnRanks(actor(ownerId, 0), target("member", 99), ownerId),
    ).toBe(true);
  });

  it("never allows acting on the guild owner", () => {
    expect(canActOnRanks(actor("admin", 99), target(ownerId, 0), ownerId)).toBe(
      false,
    );
  });

  it("requires a strictly higher role than the target", () => {
    expect(canActOnRanks(actor("mod", 5), target("member", 4), ownerId)).toBe(
      true,
    );
    expect(canActOnRanks(actor("mod", 5), target("peer", 5), ownerId)).toBe(
      false,
    );
    expect(canActOnRanks(actor("mod", 5), target("senior", 6), ownerId)).toBe(
      false,
    );
  });

  it("does not let a non-owner act on themselves", () => {
    expect(canActOnRanks(actor("mod", 5), target("mod", 5), ownerId)).toBe(
      false,
    );
  });
});
