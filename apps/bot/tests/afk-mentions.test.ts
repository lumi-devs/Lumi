import { describe, expect, it } from "bun:test";
import { afkSince, sanitizeReason, stripNickPrefix } from "../src/modules/afk/service.ts";

describe("afk mentions and formatting", () => {
  it("sanitizes reasons", () => {
    expect(sanitizeReason("  Going to   lunch \n\n ")).toBe("Going to lunch");
    expect(sanitizeReason("")).toBe("AFK");
  });

  it("strips nick prefixes properly", () => {
    expect(stripNickPrefix("[AFK] Alice")).toBe("Alice");
    expect(stripNickPrefix("Alice")).toBeNull();
  });

  it("formats afk since duration", () => {
    const entry = {
      guildId: "123",
      userId: "456",
      reason: "Away",
      since: new Date(Date.now() - 65_000),
    };
    expect(afkSince(entry)).toBe("1m");
  });
});
