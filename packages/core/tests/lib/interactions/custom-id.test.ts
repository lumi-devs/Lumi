import { describe, it, expect } from "bun:test";
import { defineCustomId } from "#lib/interactions/custom-id.js";

describe("lib/interactions custom-id codec", () => {
  const TestId = defineCustomId("tvc", ["action", "channelId"]);

  it("round-trips build through parse", () => {
    const id = TestId.build({ action: "claim", channelId: "12345" });
    expect(id).toBe("tvc:claim:12345");
    expect(TestId.parse(id)).toEqual({ action: "claim", channelId: "12345" });
  });

  it("returns null for a different prefix", () => {
    expect(TestId.parse("other:claim:12345")).toBeNull();
  });

  it("returns null for too few segments", () => {
    expect(TestId.parse("tvc:claim")).toBeNull();
  });

  it("returns null for too many segments", () => {
    expect(TestId.parse("tvc:claim:12345:extra")).toBeNull();
  });

  it("returns null for an empty segment", () => {
    expect(TestId.parse("tvc::12345")).toBeNull();
    expect(TestId.parse("tvc:claim:")).toBeNull();
  });

  it("throws when a value contains a colon", () => {
    expect(() =>
      TestId.build({ action: "cla:im", channelId: "12345" }),
    ).toThrow();
  });

  it("returns a fully typed record", () => {
    const parsed: { action: string; channelId: string } | null = TestId.parse(
      "tvc:claim:12345",
    );
    expect(parsed).toEqual({ action: "claim", channelId: "12345" });
  });

  it("round-trips a compound prefix containing its own colon", () => {
    const CompoundId = defineCustomId("afk:mentions", ["userId", "page"]);
    const id = CompoundId.build({ userId: "999", page: "2" });
    expect(id).toBe("afk:mentions:999:2");
    expect(CompoundId.parse(id)).toEqual({ userId: "999", page: "2" });
  });
});
