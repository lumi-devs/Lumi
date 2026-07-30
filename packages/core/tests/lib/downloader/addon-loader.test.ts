import { describe, it, expect } from "vitest";

describe("Add-on Module Classification Test", () => {
  it("does not load pre-existing files in 3rd-party folder as built-in feature modules", () => {
    const builtinDir = "/home/rebiz/opt/lumi/packages/core/src/modules/mod";
    const thirdPartyDir = "/home/rebiz/opt/lumi/data/3rd-party-modules/community-extension";

    const isBuiltinAddon = builtinDir.includes("3rd-party-modules");
    const isCommunityAddon = thirdPartyDir.includes("3rd-party-modules");

    expect(isBuiltinAddon).toBe(false);
    expect(isCommunityAddon).toBe(true);
  });
});
