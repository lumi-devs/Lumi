import { describe, expect, it } from "vitest";
import {
  compileSafeRegex,
  RegexMaxLength,
  safeRegexTest,
} from "../../../shared/regex.js";

describe("safe regular expressions", () => {
  it("compiles ordinary patterns", () => {
    expect(compileSafeRegex("^hello$").ok).toBe(true);
    expect(compileSafeRegex("(?:ab)+c").ok).toBe(true);
    expect(compileSafeRegex("(?<word>ab)+").ok).toBe(true);
    expect(compileSafeRegex("[()]+").ok).toBe(true);
    expect(compileSafeRegex("a|b").ok).toBe(true);
  });

  it("rejects nested repetition and repeated alternation", () => {
    for (const pattern of [
      "(a+)+$",
      "(a|aa)+$",
      "(a|b|ab)*",
      "(?:\\w+\\s?)+$",
      "(a{1,3})+",
      "((ab)+)+",
      "(?:(a|aa))+",
      "((a|b)c)+",
    ]) {
      expect(compileSafeRegex(pattern).ok, pattern).toBe(false);
    }
  });

  it("rejects backreferences, lookbehind, and oversized patterns", () => {
    expect(compileSafeRegex("(a)\\1").ok).toBe(false);
    expect(compileSafeRegex("(?<=x)y").ok).toBe(false);
    expect(compileSafeRegex("a".repeat(RegexMaxLength + 1)).ok).toBe(false);
  });

  it("treats unsafe patterns as non-matching instead of evaluating them", () => {
    expect(safeRegexTest("^(a|aa)+$", "a".repeat(64))).toBe(false);
    expect(safeRegexTest("^a+$", "aaa")).toBe(true);
  });
});
