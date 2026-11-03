import { describe, expect, it } from "vitest";
import {
  canManageOwnerOnlyPermit,
  isBotOwner,
  isOwnerOnlyPermitNodes,
  parseOwnerIds,
} from "../../apps/dashboard/src/lib/server/permissions.ts";

describe("dashboard owner ids", () => {
  it("parses comma and whitespace separated snowflakes", () => {
    expect(
      parseOwnerIds(
        " 123456789012345678, 987654321098765432\n111111111111111111 ",
      ),
    ).toEqual([
      "123456789012345678",
      "987654321098765432",
      "111111111111111111",
    ]);
  });

  it("ignores invalid and duplicate ids", () => {
    expect(
      parseOwnerIds("not-an-id,123,123456789012345678,123456789012345678"),
    ).toEqual(["123456789012345678"]);
    expect(parseOwnerIds(null)).toEqual([]);
  });

  it("only treats configured ids as owners", () => {
    expect(isBotOwner("123456789012345678", ["123456789012345678"])).toBe(true);
    expect(isBotOwner("223456789012345678", ["123456789012345678"])).toBe(
      false,
    );
    expect(isBotOwner(undefined, ["123456789012345678"])).toBe(false);
  });
});

describe("owner-only permits", () => {
  it("treats wildcard permits as owner-only", () => {
    expect(isOwnerOnlyPermitNodes(["*"])).toBe(true);
    expect(isOwnerOnlyPermitNodes(["admin.*", "mod.ban"])).toBe(false);
  });

  it("requires an owner to manage wildcard permits", () => {
    const owners = ["123456789012345678"];

    expect(canManageOwnerOnlyPermit("123456789012345678", ["*"], owners)).toBe(
      true,
    );
    expect(canManageOwnerOnlyPermit("223456789012345678", ["*"], owners)).toBe(
      false,
    );
    expect(
      canManageOwnerOnlyPermit("223456789012345678", ["admin.*"], owners),
    ).toBe(true);
  });
});
