import { describe, expect, it } from "vitest";
import {
  formatDuration,
  isValidTimezone,
  nextCronDate,
  nextIntervalDate,
  nextRunAt,
  parseDuration,
  validateCronExpression,
} from "../duration.js";

describe("custom command duration parsing", () => {
  it("parses durations with units and combinations", () => {
    expect(parseDuration("30")).toBe(30);
    expect(parseDuration("45s")).toBe(45);
    expect(parseDuration("5m")).toBe(300);
    expect(parseDuration("1h30m")).toBe(5_400);
    expect(parseDuration("2d 4h")).toBe(187_200);
    expect(parseDuration("1w")).toBe(604_800);
  });

  it("rejects invalid durations", () => {
    expect(parseDuration("")).toBeNull();
    expect(parseDuration("5 minutes")).toBeNull();
    expect(parseDuration("5m30")).toBeNull();
    expect(parseDuration("-5m")).toBeNull();
    expect(parseDuration("2y")).toBeNull();
  });

  it("formats durations compactly", () => {
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(90)).toBe("1m 30s");
    expect(formatDuration(5_400)).toBe("1h 30m");
    expect(formatDuration(187_200)).toBe("2d 4h");
  });

  it("validates cron expressions with five fields", () => {
    expect(validateCronExpression("*/5 * * * *").ok).toBe(true);
    expect(validateCronExpression("0 9 * * 1-5").ok).toBe(true);
    expect(validateCronExpression("* * * *").ok).toBe(false);
    expect(validateCronExpression("99 * * * *").ok).toBe(false);
    expect(validateCronExpression("nope").ok).toBe(false);
  });

  it("computes the next cron run in UTC", () => {
    const from = new Date("2026-01-01T00:02:30.000Z");
    expect(nextCronDate("*/5 * * * *", from)?.toISOString()).toBe(
      "2026-01-01T00:05:00.000Z",
    );
    expect(nextCronDate("0 3 * * *", from)?.toISOString()).toBe(
      "2026-01-01T03:00:00.000Z",
    );
    expect(nextCronDate("bad", from)).toBeNull();
  });

  it("computes interval runs and combined schedules", () => {
    const from = new Date("2026-01-01T00:00:00.000Z");
    expect(nextIntervalDate(90, from)?.toISOString()).toBe(
      "2026-01-01T00:01:30.000Z",
    );
    expect(
      nextRunAt({ cron: "*/10 * * * *", timezone: "UTC", from })?.toISOString(),
    ).toBe("2026-01-01T00:10:00.000Z");
    expect(
      nextRunAt({ intervalSeconds: 30, from })?.toISOString(),
    ).toBe("2026-01-01T00:00:30.000Z");
    expect(nextRunAt({ from })).toBeNull();
  });

  it("validates timezones", () => {
    expect(isValidTimezone("UTC")).toBe(true);
    expect(isValidTimezone("America/New_York")).toBe(true);
    expect(isValidTimezone("Not/AZone")).toBe(false);
  });
});
