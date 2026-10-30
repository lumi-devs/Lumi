import { describe, expect, it } from "vitest";
import {
  buildDueWhere,
  buildRetentionWhere,
  canCreateReminder,
  isDue,
  nextRetry,
  retentionCutoff,
  retryCount,
  retryDelayMs,
  selectDueReminders,
} from "../policy.js";

const now = new Date("2026-06-15T12:00:00.000Z");

const reminder = (
  id: string,
  status: string,
  offsetMs: number,
): { id: string; status: string; remindAt: Date } => ({
  id,
  status,
  remindAt: new Date(now.getTime() + offsetMs),
});

describe("due reminder selection", () => {
  it("selects only active reminders at or before now", () => {
    const rows = [
      reminder("past", "pending", -60_000),
      reminder("now", "pending", 0),
      reminder("future", "pending", 60_000),
      reminder("retry", "retry:1", -120_000),
      reminder("processing", "processing", -180_000),
      reminder("delivered", "delivered", -240_000),
      reminder("cancelled", "cancelled", -300_000),
    ];

    expect(selectDueReminders(rows, now).map((row) => row.id)).toEqual([
      "retry",
      "past",
      "now",
    ]);
  });

  it("sorts by remind time and respects the limit", () => {
    const rows = [
      reminder("third", "pending", -10_000),
      reminder("first", "pending", -30_000),
      reminder("second", "pending", -20_000),
    ];

    expect(selectDueReminders(rows, now, 2).map((row) => row.id)).toEqual([
      "first",
      "second",
    ]);
  });

  it("treats future reminders as not due", () => {
    expect(isDue(reminder("future", "pending", 1), now)).toBe(false);
  });

  it("builds the database due filter", () => {
    expect(buildDueWhere(now)).toEqual({
      remindAt: { lte: now },
      OR: [{ status: "pending" }, { status: { startsWith: "retry:" } }],
    });
  });
});

describe("retry policy", () => {
  it("increments retry statuses and eventually fails", () => {
    expect(nextRetry("pending")).toEqual({
      status: "retry:1",
      attempt: 1,
      failed: false,
    });
    expect(nextRetry("retry:1")).toEqual({
      status: "retry:2",
      attempt: 2,
      failed: false,
    });
    expect(nextRetry("retry:2")).toEqual({
      status: "failed",
      attempt: 3,
      failed: true,
    });
  });

  it("parses retry counts", () => {
    expect(retryCount("pending")).toBe(0);
    expect(retryCount("retry:2")).toBe(2);
    expect(retryCount("retry:nope")).toBe(0);
  });

  it("backs off with each attempt", () => {
    expect(retryDelayMs(1)).toBe(5 * 60_000);
    expect(retryDelayMs(2)).toBe(10 * 60_000);
    expect(retryDelayMs(99)).toBe(60 * 60_000);
  });
});

describe("retention cleanup", () => {
  it("computes a cutoff from the configured retention window", () => {
    expect(retentionCutoff(now, 30).toISOString()).toBe(
      "2026-05-16T12:00:00.000Z",
    );
    expect(retentionCutoff(now, 0).toISOString()).toBe(
      "2026-06-14T12:00:00.000Z",
    );
  });

  it("only targets old delivered, cancelled, and failed rows", () => {
    const where = buildRetentionWhere(now, 30, "guild-1");
    expect(where.guildId).toBe("guild-1");
    expect(where.OR).toEqual([
      {
        status: "delivered",
        deliveredAt: { lte: new Date("2026-05-16T12:00:00.000Z") },
      },
      {
        status: { in: ["cancelled", "failed"] },
        createdAt: { lte: new Date("2026-05-16T12:00:00.000Z") },
      },
    ]);
    expect(JSON.stringify(where)).not.toContain('"pending"');
  });
});

describe("per-user limit", () => {
  it("allows creates below the limit only", () => {
    expect(canCreateReminder(0, 25)).toBe(true);
    expect(canCreateReminder(24, 25)).toBe(true);
    expect(canCreateReminder(25, 25)).toBe(false);
    expect(canCreateReminder(30, 25)).toBe(false);
  });
});
