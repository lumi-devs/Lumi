import { describe, expect, it } from "vitest";
import { fencedCode, inlineCode } from "../format.js";

describe("log formatting", () => {
  it("wraps content in a fence longer than any backtick run", () => {
    const value = "before ``` inside";
    const rendered = fencedCode(value, 1024);
    expect(rendered).toBe("````\nbefore ``` inside\n````");
  });

  it("truncates content before choosing the fence", () => {
    expect(fencedCode("abcdef", 3)).toBe("```\nabc\n```");
  });

  it("renders empty content as a placeholder", () => {
    expect(fencedCode("", 1024)).toBe("*No content*");
  });

  it("uses an inline span for author names with backticks", () => {
    expect(inlineCode("a`b")).toBe("``a`b``");
    expect(inlineCode("plain")).toBe("`plain`");
  });
});
