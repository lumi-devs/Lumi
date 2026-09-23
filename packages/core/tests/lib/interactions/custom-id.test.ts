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

  describe("tail option", () => {
    const TailId = defineCustomId("cfg", ["action", "moduleName"], {
      tail: "rest",
    });

    it("round-trips build through parse with a non-empty tail", () => {
      const id = TailId.build({
        action: "field",
        moduleName: "moderation",
        rest: ["logChannel", "0"],
      });
      expect(id).toBe("cfg:field:moderation:logChannel:0");
      expect(TailId.parse(id)).toEqual({
        action: "field",
        moduleName: "moderation",
        rest: ["logChannel", "0"],
      });
    });

    it("round-trips build through parse with an empty tail", () => {
      const id = TailId.build({
        action: "gsel",
        moduleName: "moderation",
        rest: [],
      });
      expect(id).toBe("cfg:gsel:moderation");
      expect(TailId.parse(id)).toEqual({
        action: "gsel",
        moduleName: "moderation",
        rest: [],
      });
    });

    it("parses when only the fields are present", () => {
      expect(TailId.parse("cfg:gsel:moderation")).toEqual({
        action: "gsel",
        moduleName: "moderation",
        rest: [],
      });
    });

    it("returns null for fewer than fields.length segments", () => {
      expect(TailId.parse("cfg:gsel")).toBeNull();
    });

    it("keeps empty tail segments, unlike field segments", () => {
      expect(TailId.parse("cfg:field:moderation::0")).toEqual({
        action: "field",
        moduleName: "moderation",
        rest: ["", "0"],
      });
    });

    it("throws when a tail value contains a colon", () => {
      expect(() =>
        TailId.build({
          action: "field",
          moduleName: "moderation",
          rest: ["log:Channel"],
        }),
      ).toThrow();
    });

    it("returns a fully typed record with a string[] tail", () => {
      const parsed: {
        action: string;
        moduleName: string;
        rest: string[];
      } | null = TailId.parse("cfg:field:moderation:logChannel:0");
      expect(parsed).toEqual({
        action: "field",
        moduleName: "moderation",
        rest: ["logChannel", "0"],
      });
    });
  });
});
