import { describe, expect, test } from "bun:test";
import { parseWarnThresholds } from "../src/modules/mod/services/thresholds.ts";

describe("warn thresholds", () => {
  test("parses valid rules and their durations", () => {
    const rules = parseWarnThresholds(
      JSON.stringify({
        "3": { action: "mute", duration: "1h" },
        "5": { action: "ban" },
      }),
    );

    expect(rules.get(3)).toEqual({ action: "mute", duration: "1h" });
    expect(rules.get(5)).toEqual({ action: "ban" });
    expect(rules.size).toBe(2);
  });

  test("ignores malformed JSON and unknown actions", () => {
    expect(parseWarnThresholds("not json").size).toBe(0);
    expect(
      parseWarnThresholds(JSON.stringify({ "2": { action: "explode" }, "0": { action: "ban" } })).size,
    ).toBe(0);
  });

  test("accepts every supported action", () => {
    const rules = parseWarnThresholds(
      JSON.stringify({
        "1": { action: "mute" },
        "2": { action: "kick" },
        "3": { action: "ban" },
        "4": { action: "quarantine" },
        "5": { action: "voice_mute" },
      }),
    );

    expect(rules.size).toBe(5);
  });

  test("accepts v1 numeric durations in seconds", () => {
    const rules = parseWarnThresholds(
      JSON.stringify({ "2": { action: "mute", duration: 3_600 } }),
    );

    expect(rules.get(2)).toEqual({ action: "mute", duration: 3_600 });
  });
});
