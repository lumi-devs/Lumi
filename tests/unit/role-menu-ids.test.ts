import { describe, expect, it } from "vitest";
import { RoleMenuIds } from "../../modules/role-menus/menu/ids.ts";

describe("RoleMenuIds", () => {
  it("round-trips button component IDs", () => {
    expect(RoleMenuIds.parse(RoleMenuIds.button("group", "option"))).toEqual({
      kind: "button",
      groupId: "group",
      optionId: "option",
    });
  });

  it("round-trips select component IDs", () => {
    expect(RoleMenuIds.parse(RoleMenuIds.select("group"))).toEqual({
      kind: "select",
      groupId: "group",
    });
  });

  it("rejects unrelated custom IDs", () => {
    expect(RoleMenuIds.parse("lumi:rolemenu:button:group")).toBeNull();
    expect(RoleMenuIds.parse("lumi:rolemenu:unknown:group")).toBeNull();
    expect(RoleMenuIds.parse("stats:refresh")).toBeNull();
  });
});
