import { describe, expect, it } from "bun:test";
import { matchPermitNode } from "../src/permits.ts";

describe("matchPermitNode", () => {
  it("matches wildcard * to anything", () => {
    expect(matchPermitNode("*", "mod.ban")).toBe(true);
    expect(matchPermitNode("*", "utility.purge")).toBe(true);
    expect(matchPermitNode("*", "anything")).toBe(true);
  });

  it("matches namespace wildcards", () => {
    expect(matchPermitNode("mod.*", "mod.ban")).toBe(true);
    expect(matchPermitNode("mod.*", "mod.lockdown.all")).toBe(true);
    expect(matchPermitNode("mod.*", "utility.purge")).toBe(false);
  });

  it("matches exact nodes", () => {
    expect(matchPermitNode("mod.ban", "mod.ban")).toBe(true);
    expect(matchPermitNode("mod.ban", "mod.kick")).toBe(false);
    expect(matchPermitNode("mod.ban", "mod.ban.sub")).toBe(false);
  });
});
