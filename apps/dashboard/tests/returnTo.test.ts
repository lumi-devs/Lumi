import { describe, expect, it } from "vitest";
import { safeReturnTo } from "../src/lib/server/returnTo";

describe("safeReturnTo", () => {
  it("keeps relative dashboard paths", () => {
    expect(safeReturnTo("/guilds")).toBe("/guilds");
    expect(safeReturnTo("/guilds?x=1")).toBe("/guilds?x=1");
    expect(safeReturnTo("/guilds/123/security#top")).toBe(
      "/guilds/123/security#top",
    );
  });

  it("rejects absolute and protocol-relative targets", () => {
    expect(safeReturnTo("https://evil.com")).toBe("/guilds");
    expect(safeReturnTo("//evil.com")).toBe("/guilds");
    expect(safeReturnTo("///evil.com")).toBe("/guilds");
    expect(safeReturnTo("/\\evil.com")).toBe("/guilds");
    expect(safeReturnTo("\\/evil.com")).toBe("/guilds");
  });

  it("rejects control characters that browsers strip from URLs", () => {
    expect(safeReturnTo("/\t/evil.com")).toBe("/guilds");
    expect(safeReturnTo("/\n/evil.com")).toBe("/guilds");
    expect(safeReturnTo("/\r/evil.com")).toBe("/guilds");
    expect(safeReturnTo("/\u0000/evil.com")).toBe("/guilds");
    expect(safeReturnTo("/\u007f/evil.com")).toBe("/guilds");
  });

  it("rejects dot-segment tricks that normalize to a network path", () => {
    expect(safeReturnTo("/guilds/..//evil.com")).toBe("/guilds");
  });

  it("falls back for missing or non-string values", () => {
    expect(safeReturnTo(null)).toBe("/guilds");
    expect(safeReturnTo(undefined)).toBe("/guilds");
    expect(safeReturnTo(42)).toBe("/guilds");
    expect(safeReturnTo("")).toBe("/guilds");
  });
});
