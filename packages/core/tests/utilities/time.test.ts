import { describe, it, expect } from "bun:test";
import { time, TimestampStyles } from "@discordjs/formatters";
import { parseDuration, formatDuration } from "@lumi/lib/utilities/time.js";

describe("time utilities", () => {
  it("formatDuration", () => {
    expect(formatDuration(50000)).toBe("50 seconds");
    expect(formatDuration(90000)).toBe("1 minute 30 seconds");
  });

  it("formatDuration passes through zero and negatives unclamped", () => {
    expect(formatDuration(0)).toBe("0 seconds");
    expect(formatDuration(-5000)).toBe("-5 seconds");
  });

  it("parseDuration", () => {
    expect(parseDuration("1m")).toBe(60000);
    expect(parseDuration("2h30m")).toBe(9000000);
    expect(parseDuration("invalid")).toBe(null);
  });

  it("timestamps", () => {
    const d = new Date(1700000000000);
    expect(time(d, TimestampStyles.RelativeTime)).toContain("<t:1700000000:R>");
    expect(time(d, TimestampStyles.ShortTime)).toContain("<t:1700000000:t>");
  });
});
