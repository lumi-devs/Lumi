import { describe, expect, it } from "vitest";
import {
  formatPermitNodeLines,
  formatPermitNodes,
  parseNodeList,
  suggestPermitName,
} from "../../src/admin/permits/nodes.ts";

describe("permit node helpers", () => {
  it("parses comma and whitespace separated node lists", () => {
    expect(parseNodeList("mod.ban, mod.kick\nadmin.config")).toEqual([
      "mod.ban",
      "mod.kick",
      "admin.config",
    ]);
  });

  it("removes duplicate and empty nodes", () => {
    expect(parseNodeList("mod.ban, mod.ban, , *")).toEqual([
      "mod.ban",
      "*",
    ]);
  });

  it("formats a compact node summary", () => {
    expect(formatPermitNodes(["mod.ban", "mod.kick", "mod.warn"], 2)).toBe(
      "`mod.ban` `mod.kick` +1",
    );
  });

  it("formats nodes one per line without separators", () => {
    expect(formatPermitNodeLines(["mod.ban", "mod.kick"])).toBe(
      "`mod.ban`\n`mod.kick`",
    );
  });

  it("formats an empty node list", () => {
    expect(formatPermitNodes([])).toBe("*no nodes*");
    expect(formatPermitNodeLines([])).toBe("*no nodes*");
  });

  it("suggests a single name from one node", () => {
    expect(suggestPermitName(["mod.ban"], "Grant")).toBe("Grant mod ban");
  });

  it("suggests a grouped name from multiple nodes", () => {
    expect(suggestPermitName(["mod.ban", "mod.kick"], "Deny")).toBe(
      "Deny mod ban +1",
    );
  });
});
