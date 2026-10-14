import { describe, it, expect } from "bun:test";
import { buildPermitExplainView } from "#src/admin/ui/Permissions.js";
import type { PermitTierExplanation } from "#src/lib/api/permissions/PermitResolver.js";

function cardText(card: { components?: unknown }): string {
  return JSON.stringify(card);
}

describe("buildPermitExplainView", () => {
  it("renders each tier with its verdict and matched rule", () => {
    const rows: PermitTierExplanation[] = [
      { tier: "owner", verdict: "pass" },
      { tier: "manager", verdict: "pass" },
      { tier: "enforced:user", verdict: "pass" },
      { tier: "custom:channel:C1", verdict: "deny", detail: "deny mod.ban" },
      { tier: "custom:role:R1", verdict: "allow", detail: "grant mod.*" },
    ];
    const text = cardText(buildPermitExplainView("mod.ban", "@Rogue", rows));
    expect(text).toContain("mod.ban");
    expect(text).toContain("@Rogue");
    expect(text).toContain("custom:channel:C1");
    expect(text).toContain("deny mod.ban");
    expect(text).toContain("custom:role:R1");
    expect(text).toContain("grant mod.*");
    expect(text).toContain("can't");
  });

  it("says can when no tier denies", () => {
    const rows: PermitTierExplanation[] = [
      { tier: "owner", verdict: "pass" },
      { tier: "custom:role:R1", verdict: "allow", detail: "grant mod.ban" },
    ];
    expect(cardText(buildPermitExplainView("mod.ban", "@Helper", rows))).toContain("can");
  });
});
