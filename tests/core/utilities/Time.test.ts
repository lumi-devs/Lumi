import { describe, it, expect } from "bun:test";
import { time, TimestampStyles } from "@discordjs/formatters";
import { parseDuration, formatDuration } from "#src/lib/utilities/Time.js";

describe("time utilities", () => {
  it("formatDuration", () => {
    expect(formatDuration(50000)).toBe("50s");
    expect(formatDuration(90000)).toBe("1m 30s");
    expect(formatDuration(90061000)).toBe("1d 1h 1m 1s");
  });

  it("formatDuration clamps zero and negatives to 0s", () => {
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(-5000)).toBe("0s");
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
