import { describe, expect, it } from "vitest";
import { compileSafeRegex, safeRegexTest } from "../../../shared/regex.js";

describe("ticket auto-tag regex safety", () => {
  it("blocks catastrophic auto-tag patterns", () => {
    expect(compileSafeRegex("(a|aa)+$").ok).toBe(false);
    expect(compileSafeRegex("(x+x+)+y").ok).toBe(false);
    expect(safeRegexTest("^(a|aa)+$", "a".repeat(64))).toBe(false);
  });

  it("still matches safe auto-tag patterns", () => {
    expect(safeRegexTest("^\\s*refund\\b", "Refund please")).toBe(true);
    expect(safeRegexTest("^\\s*refund\\b", "billing question")).toBe(false);
  });
});
