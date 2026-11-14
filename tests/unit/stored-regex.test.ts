import type { ModuleServices } from "@lumi/module-kit";
import { describe, expect, it, vi } from "vitest";
import { invalidRegexPatterns } from "../../modules/shared/regex.js";
import { warnInvalidRegexPatterns } from "../../modules/shared/regex-warnings.js";

describe("stored regex validation", () => {
  it("reports only patterns that fail safe compilation", () => {
    expect(invalidRegexPatterns(["\\bword\\b", "(", "(a+)+$"], "i")).toEqual([
      {
        pattern: "(",
        error: expect.stringContaining("Invalid regular expression"),
      },
      {
        pattern: "(a+)+$",
        error: "Nested repetition or repeated alternation is not allowed.",
      },
    ]);
  });

  it("logs an invalid stored pattern once per guild and field", () => {
    const warn = vi.fn();
    const services = {
      observability: { logger: { warn } },
    } as unknown as ModuleServices;

    warnInvalidRegexPatterns(
      services,
      "test-module",
      "guild-dedupe",
      "regexRules",
      ["bad["],
    );
    warnInvalidRegexPatterns(
      services,
      "test-module",
      "guild-dedupe",
      "regexRules",
      ["bad["],
    );

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      "[test-module] ignoring invalid stored regex pattern",
      expect.objectContaining({
        guildId: "guild-dedupe",
        field: "regexRules",
        pattern: "bad[",
      }),
    );
  });
});
