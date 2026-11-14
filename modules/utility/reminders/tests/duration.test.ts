import { describe, expect, it } from "vitest";
import {
  DurationParseError,
  formatDuration,
  MaxReminderDurationMs,
  parseDuration,
} from "../duration.js";

describe("parseDuration", () => {
  it("parses single units", () => {
    expect(parseDuration("10s")).toBe(10_000);
    expect(parseDuration("5m")).toBe(5 * 60_000);
    expect(parseDuration("2h")).toBe(2 * 3_600_000);
    expect(parseDuration("3d")).toBe(3 * 86_400_000);
    expect(parseDuration("1w")).toBe(7 * 86_400_000);
  });

  it("parses combined durations", () => {
    expect(parseDuration("1h30m")).toBe(90 * 60_000);
    expect(parseDuration("1w2d3h4m5s")).toBe(
      7 * 86_400_000 + 2 * 86_400_000 + 3 * 3_600_000 + 4 * 60_000 + 5_000,
    );
    expect(parseDuration("2d 12h")).toBe(60 * 3_600_000);
  });

  it("is case insensitive", () => {
    expect(parseDuration("1H30M")).toBe(90 * 60_000);
  });

  it("accepts the one year maximum", () => {
    expect(parseDuration("365d")).toBe(MaxReminderDurationMs);
    expect(parseDuration("52w1d")).toBe(MaxReminderDurationMs);
  });

  it("rejects invalid durations", () => {
    for (const value of ["", "abc", "10", "10x", "1y", "0m", "-5m"]) {
      expect(() => parseDuration(value)).toThrow(DurationParseError);
    }
  });

  it("rejects durations over one year", () => {
    expect(() => parseDuration("366d")).toThrow(DurationParseError);
    expect(() => parseDuration("999999w")).toThrow(DurationParseError);
  });
});

describe("formatDuration", () => {
  it("formats durations from milliseconds", () => {
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(90 * 60_000)).toBe("1h 30m");
    expect(formatDuration((7 * 86_400 + 3_600) * 1_000)).toBe("1w 1h");
  });
});
