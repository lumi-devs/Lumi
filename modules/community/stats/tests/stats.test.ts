import { describe, expect, it } from "vitest";
import {
  aggregateAverageSeries,
  aggregateSeries,
  bucketStart,
  formatDuration,
  parseDuration,
  parseLookback,
  rangeStartMs,
  rankOf,
  retentionCutoff,
  sampleSeries,
  splitMinutesBetween,
  sumInWindow,
  topEntries,
} from "../ranges.ts";

const Hour = 3_600_000;
const Day = 24 * Hour;

describe("duration parsing", () => {
  it("parses supported duration units", () => {
    expect(parseDuration("30s")).toBe(30_000);
    expect(parseDuration("90m")).toBe(90 * 60_000);
    expect(parseDuration("2h")).toBe(2 * Hour);
    expect(parseDuration("7d")).toBe(7 * Day);
    expect(parseDuration("1w")).toBe(7 * Day);
  });

  it("rejects malformed and non-positive durations", () => {
    expect(parseDuration(undefined)).toBeNull();
    expect(parseDuration("7")).toBeNull();
    expect(parseDuration("0d")).toBeNull();
    expect(parseDuration("soon")).toBeNull();
    expect(parseDuration("-1d")).toBeNull();
  });

  it("normalizes lookbacks to the allowed range", () => {
    expect(parseLookback(undefined)).toBe("7d");
    expect(parseLookback("1d")).toBe("1d");
    expect(parseLookback("10d")).toBe("30d");
    expect(parseLookback("90d")).toBe("60d");
    expect(parseLookback("365d")).toBe("60d");
  });
});

describe("bucketing", () => {
  it("floors timestamps to UTC bucket boundaries", () => {
    const at = new Date("2026-10-30T14:37:42.500Z");
    expect(bucketStart(at, 60).toISOString()).toBe("2026-10-30T14:00:00.000Z");
    expect(bucketStart(at, 10).toISOString()).toBe("2026-10-30T14:30:00.000Z");
  });

  it("splits a voice session into minute buckets", () => {
    const start = new Date("2026-10-30T12:00:30.000Z").getTime();
    const end = new Date("2026-10-30T12:02:10.000Z").getTime();
    const slices = splitMinutesBetween(start, end);

    expect(slices).toHaveLength(3);
    expect(slices[0]?.bucketStart.toISOString()).toBe(
      "2026-10-30T12:00:00.000Z",
    );
    expect(slices.map((slice) => slice.seconds)).toEqual([30, 60, 10]);
  });

  it("returns no slices for empty or reversed sessions", () => {
    expect(splitMinutesBetween(1_000, 1_000)).toEqual([]);
    expect(splitMinutesBetween(2_000, 1_000)).toEqual([]);
  });
});

describe("range aggregation", () => {
  const start = new Date("2026-10-30T00:00:00.000Z").getTime();
  const entries = [
    { bucketStart: new Date(start + Hour), value: 4 },
    { bucketStart: new Date(start + Hour + 10 * 60_000), value: 3 },
    { bucketStart: new Date(start + 3 * Hour), value: 8 },
    { bucketStart: new Date(start - Hour), value: 99 },
    { bucketStart: new Date(start + 5 * Hour), value: 99 },
  ];

  it("sums entries inside a window and ignores the edges", () => {
    expect(sumInWindow(entries, start, start + 4 * Hour)).toBe(15);
  });

  it("groups entries into fixed buckets", () => {
    expect(aggregateSeries(entries, start, start + 4 * Hour, Hour)).toEqual([
      0, 7, 0, 8,
    ]);
  });

  it("averages entries per bucket for snapshot series", () => {
    expect(
      aggregateAverageSeries(entries, start, start + 4 * Hour, Hour),
    ).toEqual([0, 3.5, 0, 8]);
  });
});

describe("chart point sampling", () => {
  it("returns the requested number of points", () => {
    const values = Array.from({ length: 100 }, (_, index) => index);
    const sampled = sampleSeries(values, 12);
    expect(sampled).toHaveLength(12);
    expect(sampled.every((value) => Number.isFinite(value))).toBe(true);
  });

  it("leaves short series unchanged", () => {
    expect(sampleSeries([1, 2, 3], 10)).toEqual([1, 2, 3]);
    expect(sampleSeries([], 10)).toEqual([]);
  });
});

describe("retention cutoff", () => {
  it("caps raw data at 90 days", () => {
    const now = new Date("2026-10-30T12:00:00.000Z").getTime();
    expect(retentionCutoff(now).toISOString()).toBe("2026-08-01T12:00:00.000Z");
  });
});

describe("top and rank ordering", () => {
  const values = new Map([
    ["b", 5],
    ["a", 5],
    ["c", 9],
    ["d", 0],
  ]);

  it("orders by value descending and breaks ties by key", () => {
    expect(topEntries(values, 3)).toEqual([
      { key: "c", value: 9 },
      { key: "a", value: 5 },
      { key: "b", value: 5 },
    ]);
  });

  it("ranks only members with activity", () => {
    expect(rankOf(values, "c")).toEqual({ rank: 1, total: 3 });
    expect(rankOf(values, "a")).toEqual({ rank: 2, total: 3 });
    expect(rankOf(values, "d")).toEqual({ rank: 0, total: 0 });
  });
});

describe("range starts", () => {
  it("computes lookback starts from a fixed clock", () => {
    const now = new Date("2026-10-30T00:00:00.000Z").getTime();
    expect(new Date(rangeStartMs("1d", now)).toISOString()).toBe(
      "2026-10-29T00:00:00.000Z",
    );
    expect(new Date(rangeStartMs("60d", now)).toISOString()).toBe(
      "2026-08-31T00:00:00.000Z",
    );
  });
});

describe("formatting", () => {
  it("formats voice durations compactly", () => {
    expect(formatDuration(0)).toBe("0m");
    expect(formatDuration(90)).toBe("2m");
    expect(formatDuration(3_600)).toBe("1h");
    expect(formatDuration(5_400)).toBe("1h 30m");
  });
});
