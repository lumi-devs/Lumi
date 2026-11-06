import { describe, expect, it } from "vitest";
import { compileSafeRegex, safeRegexTest } from "../trigger.js";

describe("custom command regex triggers", () => {
  it("rejects overlapping-alternation repetition", () => {
    expect(compileSafeRegex("(a|aa)+$").ok).toBe(false);
    expect(compileSafeRegex("(?:a|ab)*$").ok).toBe(false);
    expect(safeRegexTest("^(a|aa)+$", "a".repeat(64))).toBe(false);
  });

  it("keeps accepting safe trigger patterns", () => {
    expect(compileSafeRegex("^\\d{2,4}$").ok).toBe(true);
    expect(safeRegexTest("^hello\\s+world$", "hello world")).toBe(true);
  });
});
