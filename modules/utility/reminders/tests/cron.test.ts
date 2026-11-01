import { describe, expect, it } from "vitest";
import { isValidCron, nextCronOccurrence } from "../cron.js";

const from = new Date("2026-01-01T00:07:30.000Z");

describe("nextCronOccurrence", () => {
  it("finds the next daily occurrence in UTC", () => {
    expect(nextCronOccurrence("0 9 * * *", from)?.toISOString()).toBe(
      "2026-01-01T09:00:00.000Z",
    );
    expect(nextCronOccurrence("0 3 * * *", from)?.toISOString()).toBe(
      "2026-01-01T03:00:00.000Z",
    );
  });

  it("steps minute-based schedules", () => {
    expect(nextCronOccurrence("*/15 * * * *", from)?.toISOString()).toBe(
      "2026-01-01T00:15:00.000Z",
    );
  });

  it("respects weekday fields", () => {
    expect(nextCronOccurrence("0 9 * * 1", from)?.toISOString()).toBe(
      "2026-01-05T09:00:00.000Z",
    );
  });

  it("returns null for invalid or impossible schedules", () => {
    expect(nextCronOccurrence("not a cron", from)).toBeNull();
    expect(nextCronOccurrence("0 0 31 2 *", from)).toBeNull();
  });
});

describe("isValidCron", () => {
  it("validates five-field cron expressions", () => {
    expect(isValidCron("0 9 * * 1-5")).toBe(true);
    expect(isValidCron("*/5 * * * *")).toBe(true);
    expect(isValidCron("0 9 * *")).toBe(false);
    expect(isValidCron("bad")).toBe(false);
  });
});
