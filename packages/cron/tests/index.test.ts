import { describe, expect, it } from "vitest";
import {
  isValidCron,
  matchesCron,
  nextCronOccurrence,
  parseCron,
  zonedTimeParts,
} from "../src/index.js";

describe("@lumi/cron — parseCron", () => {
  it("parses a simple 5-field cron", () => {
    const parsed = parseCron("0 4 * * *");
    expect(parsed.minute).toEqual([0]);
    expect(parsed.hour).toEqual([4]);
    expect(parsed.dayOfMonth).toEqual(Array.from({ length: 31 }, (_, i) => i + 1));
    expect(parsed.month).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
    expect(parsed.dayOfWeek).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(parsed.dayOfMonthWildcard).toBe(true);
    expect(parsed.dayOfWeekWildcard).toBe(true);
  });

  it("parses step ranges like */15", () => {
    const parsed = parseCron("*/15 * * * *");
    expect(parsed.minute).toEqual([0, 15, 30, 45]);
    expect(parsed.hour).toEqual(Array.from({ length: 24 }, (_, i) => i));
  });

  it("parses step from specific start N/step (N to max)", () => {
    const parsed = parseCron("5/15 * * * *");
    expect(parsed.minute).toEqual([5, 20, 35, 50]);
  });

  it("parses comma-separated lists", () => {
    const parsed = parseCron("0,15,30,45 * * * *");
    expect(parsed.minute).toEqual([0, 15, 30, 45]);
  });

  it("parses month names", () => {
    const parsed = parseCron("0 0 1 Jan,Mar,May *");
    expect(parsed.month).toEqual([1, 3, 5]);
  });

  it("parses weekday names and normalizes 7 to 0", () => {
    const parsed = parseCron("0 0 * * Mon,Fri");
    expect(parsed.dayOfWeek).toEqual([1, 5]);
  });

  it("parses weekday range with names", () => {
    const parsed = parseCron("0 0 * * Mon-Fri");
    expect(parsed.dayOfWeek).toEqual([1, 2, 3, 4, 5]);
  });

  it("parses step on weekdays", () => {
    const parsed = parseCron("0 0 * * */2");
    expect(parsed.dayOfWeek).toEqual([0, 2, 4, 6]);
  });

  it("parses day-of-month ranges", () => {
    const parsed = parseCron("0 0 1-15 * *");
    expect(parsed.dayOfMonth).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
  });

  it("parses day-of-month step", () => {
    const parsed = parseCron("0 0 */5 * *");
    expect(parsed.dayOfMonth).toEqual([1, 6, 11, 16, 21, 26, 31]);
  });

  it("parses complex combined expression", () => {
    const parsed = parseCron("*/30 9-17 1-15 1,6,12 Mon-Fri");
    expect(parsed.minute).toEqual([0, 30]);
    expect(parsed.hour).toEqual(Array.from({ length: 9 }, (_, i) => i + 9));
    expect(parsed.dayOfMonth).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
    expect(parsed.month).toEqual([1, 6, 12]);
    expect(parsed.dayOfWeek).toEqual([1, 2, 3, 4, 5]);
  });

  it("throws on invalid field count", () => {
    expect(() => parseCron("0 4 * *")).toThrow("expected 5 fields");
    expect(() => parseCron("0 4 * * * *")).toThrow("expected 5 fields");
  });

  it("throws on invalid step", () => {
    expect(() => parseCron("*/0 * * * *")).toThrow("field is empty");
    expect(() => parseCron("*/-5 * * * *")).toThrow("field is empty");
  });

  it("throws on out-of-range values", () => {
    expect(() => parseCron("60 * * * *")).toThrow("field is empty");
    expect(() => parseCron("* 24 * * *")).toThrow("field is empty");
    expect(() => parseCron("* * 32 * *")).toThrow("field is empty");
    expect(() => parseCron("* * * 13 *")).toThrow("field is empty");
  });

  it("caches parsed expressions", () => {
    const p1 = parseCron("0 4 * * *");
    const p2 = parseCron("0 4 * * *");
    expect(p1).toBe(p2);
  });
});

describe("@lumi/cron — zonedTimeParts", () => {
  it("returns UTC parts when no timezone", () => {
    const date = new Date("2024-06-15T12:30:00.000Z");
    const parts = zonedTimeParts(date);
    expect(parts.hour).toBe(12);
    expect(parts.minute).toBe(30);
    expect(parts.dayOfMonth).toBe(15);
    expect(parts.month).toBe(6);
    expect(parts.dayOfWeek).toBe(6); // Saturday
  });

  it("handles timezone offset", () => {
    const date = new Date("2024-06-15T12:30:00.000Z");
    const parts = zonedTimeParts(date, "America/New_York");
    expect(parts.hour).toBe(8); // EDT is UTC-4
    expect(parts.minute).toBe(30);
    expect(parts.dayOfMonth).toBe(15);
    expect(parts.month).toBe(6);
  });

  it("handles timezone with DST", () => {
    const winter = new Date("2024-01-15T12:30:00.000Z");
    const winterParts = zonedTimeParts(winter, "America/New_York");
    expect(winterParts.hour).toBe(7); // EST is UTC-5

    const summer = new Date("2024-07-15T12:30:00.000Z");
    const summerParts = zonedTimeParts(summer, "America/New_York");
    expect(summerParts.hour).toBe(8); // EDT is UTC-4
  });
});

describe("@lumi/cron — matchesCron", () => {
  it("matches exact minute", () => {
    const date = new Date("2024-06-15T04:00:00.000Z");
    expect(matchesCron("0 4 * * *", date)).toBe(true);
    expect(matchesCron("1 4 * * *", date)).toBe(false);
  });

  it("matches step expressions", () => {
    const date1 = new Date("2024-06-15T04:00:00.000Z");
    const date2 = new Date("2024-06-15T04:15:00.000Z");
    const date3 = new Date("2024-06-15T04:10:00.000Z");
    expect(matchesCron("*/15 * * * *", date1)).toBe(true);
    expect(matchesCron("*/15 * * * *", date2)).toBe(true);
    expect(matchesCron("*/15 * * * *", date3)).toBe(false);
  });

  it("matches hour ranges", () => {
    const date = new Date("2024-06-15T14:00:00.000Z");
    expect(matchesCron("0 9-17 * * *", date)).toBe(true);
    expect(matchesCron("0 18-23 * * *", date)).toBe(false);
  });

  it("matches day-of-month", () => {
    const date = new Date("2024-06-15T00:00:00.000Z");
    expect(matchesCron("0 0 15 * *", date)).toBe(true);
    expect(matchesCron("0 0 1-10 * *", date)).toBe(false);
  });

  it("matches month", () => {
    const date = new Date("2024-06-15T00:00:00.000Z");
    expect(matchesCron("0 0 * 6 *", date)).toBe(true);
    expect(matchesCron("0 0 * 1,6,12 *", date)).toBe(true);
    expect(matchesCron("0 0 * 1,2,3 *", date)).toBe(false);
  });

  it("matches weekday", () => {
    const date = new Date("2024-06-15T00:00:00.000Z"); // Saturday
    expect(matchesCron("0 0 * * 6", date)).toBe(true);
    expect(matchesCron("0 0 * * Sat", date)).toBe(true);
    expect(matchesCron("0 0 * * Mon-Fri", date)).toBe(false);
  });

  it("uses timezone when provided", () => {
    // 2024-06-15T04:00:00Z is 2024-06-15T00:00:00 in America/New_York (EDT)
    const date = new Date("2024-06-15T04:00:00.000Z");
    expect(matchesCron("0 0 * * *", date, "America/New_York")).toBe(true);
    expect(matchesCron("0 4 * * *", date, "America/New_York")).toBe(false);
  });

  it("returns false on invalid cron expression", () => {
    const date = new Date("2024-06-15T04:00:00.000Z");
    expect(matchesCron("invalid", date)).toBe(false);
  });

  it("Vixie semantics: both day fields restricted = OR", () => {
    // June 15, 2024 is a Saturday (dayOfWeek=6, dayOfMonth=15)
    const date = new Date("2024-06-15T00:00:00.000Z");

    // Both fields restricted: day-of-month=15 OR day-of-week=6 (Sat)
    // Should match because it's the 15th
    expect(matchesCron("0 0 15 * 6", date)).toBe(true);

    // Should also match because it's Saturday
    expect(matchesCron("0 0 10 * 6", date)).toBe(true);

    // Should NOT match because neither 10th nor Sunday
    expect(matchesCron("0 0 10 * 0", date)).toBe(false);
  });

  it("Vixie semantics: one wildcard = AND (both must match)", () => {
    // June 15, 2024 is Saturday (dayOfWeek=6, dayOfMonth=15)
    const date = new Date("2024-06-15T00:00:00.000Z");

    // dayOfMonth wildcard, dayOfWeek restricted -> both must match (impossible for Sat on 15th)
    // Actually: when dayOfMonth is *, it matches all days, so dayOfWeek must also match
    expect(matchesCron("0 0 * * 6", date)).toBe(true); // Saturday matches
    expect(matchesCron("0 0 * * 1", date)).toBe(false); // Monday doesn't match

    // dayOfWeek wildcard, dayOfMonth restricted
    expect(matchesCron("0 0 15 * *", date)).toBe(true); // 15th matches
    expect(matchesCron("0 0 10 * *", date)).toBe(false); // 10th doesn't match
  });

  it("handles real-world cron: stats daily at 4am", () => {
    // 0 4 * * * — runs at 4:00 AM every day
    const dates = [
      new Date("2024-06-15T04:00:00.000Z"),
      new Date("2024-06-16T04:00:00.000Z"),
      new Date("2024-06-17T04:00:00.000Z"),
    ];
    for (const date of dates) {
      expect(matchesCron("0 4 * * *", date)).toBe(true);
    }
    // Wrong hour
    expect(matchesCron("0 4 * * *", new Date("2024-06-15T05:00:00.000Z"))).toBe(false);
  });

  it("handles real-world cron: reminders hourly at minute 0", () => {
    // 0 * * * * — runs at minute 0 of every hour
    const date1 = new Date("2024-06-15T04:00:00.000Z");
    const date2 = new Date("2024-06-15T04:30:00.000Z");
    expect(matchesCron("0 * * * *", date1)).toBe(true);
    expect(matchesCron("0 * * * *", date2)).toBe(false);
  });

  it("handles leap year Feb 29", () => {
    const date = new Date("2024-02-29T00:00:00.000Z");
    expect(matchesCron("0 0 29 2 *", date)).toBe(true);
    expect(matchesCron("0 0 30 2 *", date)).toBe(false);
  });
});

describe("@lumi/cron — edge cases", () => {
  it("handles ? as wildcard alias", () => {
    const p1 = parseCron("0 4 ? * *");
    const p2 = parseCron("0 4 * * *");
    expect(p1.dayOfMonth).toEqual(p2.dayOfMonth);
    expect(p1.dayOfMonthWildcard).toBe(true);

    const p3 = parseCron("0 4 * * ?");
    expect(p3.dayOfWeekWildcard).toBe(true);
  });

  it("handles empty lists gracefully", () => {
    expect(() => parseCron("0 4 , * *")).toThrow("field is empty");
  });

  it("handles step on range", () => {
    const parsed = parseCron("0 9-17/2 * * *");
    expect(parsed.hour).toEqual([9, 11, 13, 15, 17]);
  });

  it("handles step on month range", () => {
    const parsed = parseCron("0 0 * 1-12/3 *");
    expect(parsed.month).toEqual([1, 4, 7, 10]);
  });
});

describe("@lumi/cron — isValidCron", () => {
  it("validates five-field cron expressions", () => {
    expect(isValidCron("0 9 * * 1-5")).toBe(true);
    expect(isValidCron("*/5 * * * *")).toBe(true);
    expect(isValidCron("0 9 * *")).toBe(false);
    expect(isValidCron("bad")).toBe(false);
  });
});

describe("@lumi/cron — nextCronOccurrence", () => {
  const from = new Date("2026-01-01T00:07:30.000Z");

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

  it("respects timezone parameter", () => {
    // 09:00 in America/New_York (UTC-5 in January) is 14:00 UTC
    expect(
      nextCronOccurrence("0 9 * * *", from, "America/New_York")?.toISOString(),
    ).toBe("2026-01-01T14:00:00.000Z");
  });
});
