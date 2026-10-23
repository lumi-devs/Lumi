import { describe, expect, it } from "bun:test";
import { formatDuration, parseDuration, Time } from "../src/time.ts";

describe("parseDuration", () => {
  it("parses single units", () => {
    expect(parseDuration("30s")).toBe(30 * Time.Second);
    expect(parseDuration("10m")).toBe(10 * Time.Minute);
    expect(parseDuration("2h")).toBe(2 * Time.Hour);
    expect(parseDuration("1d")).toBe(Time.Day);
    expect(parseDuration("1w")).toBe(7 * Time.Day);
  });

  it("parses compound and word forms", () => {
    expect(parseDuration("1h30m")).toBe(Time.Hour + 30 * Time.Minute);
    expect(parseDuration("1 day 2 hours")).toBe(Time.Day + 2 * Time.Hour);
    expect(parseDuration("1d, 12h")).toBe(Time.Day + 12 * Time.Hour);
    expect(parseDuration("1.5h")).toBe(90 * Time.Minute);
  });

  it("formats compound durations", () => {
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(90 * Time.Minute)).toBe("1h 30m");
    expect(formatDuration(Time.Day + 2 * Time.Hour + 3 * Time.Minute)).toBe("1d 2h 3m");
  });

  it("rejects empty, zero, negative, and trailing junk", () => {
    expect(parseDuration("")).toBeNull();
    expect(parseDuration("0m")).toBeNull();
    expect(parseDuration("-5m")).toBeNull();
    expect(parseDuration("10mabc")).toBeNull();
    expect(parseDuration("abc")).toBeNull();
    expect(parseDuration("1h banana")).toBeNull();
  });
});
