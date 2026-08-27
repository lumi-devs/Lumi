import { describe, it, expect } from "vitest";
import { parseDuration, formatDuration, relativeTimestamp, shortTimestamp } from "#utilities/time.js";

describe("time utilities", () => {
  it("formatDuration", () => {
    expect(formatDuration(50000)).toBe("50s");
    expect(formatDuration(90000)).toBe("1m");
  });

  it("formatDuration clamps negative input to 0s", () => {
    expect(formatDuration(-5000)).toBe("0s");
  });

  it("parseDuration", () => {
    expect(parseDuration("1m")).toBe(60000);
    expect(parseDuration("2h30m")).toBe(9000000);
    expect(parseDuration("invalid")).toBe(null);
  });

  it("timestamps", () => {
    const d = new Date(1700000000000);
    expect(relativeTimestamp(d)).toContain("<t:1700000000:R>");
    expect(shortTimestamp(d)).toContain("<t:1700000000:t>");
  });
});
