import {
  DefaultLookback,
  LookbackValues,
  type Lookback,
  MaxLookbackDays,
  RetentionDays,
} from "./constants.js";

const SecondMs = 1_000;
const MinuteMs = 60 * SecondMs;
const HourMs = 60 * MinuteMs;
const DayMs = 24 * HourMs;

export const LookbackMs: Record<Lookback, number> = {
  "1d": DayMs,
  "7d": 7 * DayMs,
  "30d": 30 * DayMs,
  "60d": 60 * DayMs,
};

export const MaxLookbackMs = MaxLookbackDays * DayMs;

export interface TimedValue {
  bucketStart: Date | number;
  value: number;
}

export function parseDuration(input: string | null | undefined): number | null {
  if (typeof input !== "string") return null;
  const match = /^\s*(\d+(?:\.\d+)?)\s*(s|m|h|d|w)\s*$/i.exec(input);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  switch (match[2]?.toLowerCase()) {
    case "s":
      return Math.round(amount * SecondMs);
    case "m":
      return Math.round(amount * MinuteMs);
    case "h":
      return Math.round(amount * HourMs);
    case "d":
      return Math.round(amount * DayMs);
    case "w":
      return Math.round(amount * 7 * DayMs);
    default:
      return null;
  }
}

export function clampLookbackMs(ms: number): number {
  if (!Number.isFinite(ms) || ms <= 0) return LookbackMs[DefaultLookback];
  return Math.min(Math.max(ms, MinuteMs), MaxLookbackMs);
}

export function parseLookback(value: string | null | undefined): Lookback {
  if (value && (LookbackValues as readonly string[]).includes(value)) {
    return value as Lookback;
  }
  const requested = clampLookbackMs(parseDuration(value) ?? 0);
  for (const lookback of LookbackValues) {
    if (LookbackMs[lookback] >= requested) return lookback;
  }
  return "60d";
}

export function rangeStartMs(
  lookback: Lookback,
  nowMs: number = Date.now(),
): number {
  return nowMs - LookbackMs[lookback];
}

export function rangeStart(lookback: Lookback, nowMs?: number): Date {
  return new Date(rangeStartMs(lookback, nowMs));
}

export function bucketStartMs(
  value: Date | number | string,
  bucketMinutes: number,
): number {
  const ms =
    value instanceof Date ? value.getTime() : new Date(value).getTime();
  const size = Math.max(1, Math.floor(bucketMinutes)) * MinuteMs;
  return Math.floor(ms / size) * size;
}

export function bucketStart(
  value: Date | number | string,
  bucketMinutes: number,
): Date {
  return new Date(bucketStartMs(value, bucketMinutes));
}

export interface TimeSlice {
  bucketStart: Date;
  seconds: number;
}

export function splitMinutesBetween(
  startMs: number,
  endMs: number,
): TimeSlice[] {
  const slices = new Map<number, number>();
  let cursor = Math.floor(startMs / SecondMs) * SecondMs;
  const end = Math.floor(endMs / SecondMs) * SecondMs;
  if (end <= cursor) return [];

  while (cursor < end) {
    const bucket = Math.floor(cursor / MinuteMs) * MinuteMs;
    const bucketEnd = bucket + MinuteMs;
    const chunkEnd = Math.min(end, bucketEnd);
    const seconds = Math.max(0, Math.round((chunkEnd - cursor) / SecondMs));
    if (seconds > 0) {
      slices.set(bucket, (slices.get(bucket) ?? 0) + seconds);
    }
    cursor = chunkEnd;
  }

  return Array.from(slices, ([bucket, seconds]) => ({
    bucketStart: new Date(bucket),
    seconds,
  }));
}

export function aggregateSeries(
  entries: readonly TimedValue[],
  startMs: number,
  endMs: number,
  bucketMs: number,
): number[] {
  const size = Math.max(1, bucketMs);
  const length = Math.max(1, Math.ceil((endMs - startMs) / size));
  const values = new Array<number>(length).fill(0);

  for (const entry of entries) {
    const at =
      entry.bucketStart instanceof Date
        ? entry.bucketStart.getTime()
        : entry.bucketStart;
    if (at < startMs || at >= endMs) continue;
    const index = Math.floor((at - startMs) / size);
    if (index < 0 || index >= length) continue;
    values[index] = (values[index] ?? 0) + entry.value;
  }

  return values;
}

export function aggregateAverageSeries(
  entries: readonly TimedValue[],
  startMs: number,
  endMs: number,
  bucketMs: number,
): number[] {
  const size = Math.max(1, bucketMs);
  const length = Math.max(1, Math.ceil((endMs - startMs) / size));
  const totals = new Array<number>(length).fill(0);
  const counts = new Array<number>(length).fill(0);

  for (const entry of entries) {
    const at =
      entry.bucketStart instanceof Date
        ? entry.bucketStart.getTime()
        : entry.bucketStart;
    if (at < startMs || at >= endMs) continue;
    const index = Math.floor((at - startMs) / size);
    if (index < 0 || index >= length) continue;
    totals[index] = (totals[index] ?? 0) + entry.value;
    counts[index] = (counts[index] ?? 0) + 1;
  }

  return totals.map((total, index) => {
    const count = counts[index] ?? 0;
    return count > 0 ? total / count : 0;
  });
}

export function sampleSeries(
  values: readonly number[],
  target: number,
): number[] {
  const wanted = Math.max(0, Math.floor(target));
  if (wanted === 0 || values.length === 0) return [];
  if (values.length <= wanted) return [...values];
  if (wanted === 1) return [values[values.length - 1] ?? 0];

  const sampled: number[] = [];
  for (let i = 0; i < wanted; i++) {
    const start = Math.floor((i * values.length) / wanted);
    const end = Math.max(
      start + 1,
      Math.floor(((i + 1) * values.length) / wanted),
    );
    let total = 0;
    for (let index = start; index < end; index++) {
      total += values[index] ?? 0;
    }
    sampled.push(total / (end - start));
  }
  return sampled;
}

export function sumInWindow(
  entries: readonly TimedValue[],
  startMs: number,
  endMs: number,
): number {
  let total = 0;
  for (const entry of entries) {
    const at =
      entry.bucketStart instanceof Date
        ? entry.bucketStart.getTime()
        : entry.bucketStart;
    if (at >= startMs && at < endMs) total += entry.value;
  }
  return total;
}

export function retentionCutoff(
  nowMs: number = Date.now(),
  days: number = RetentionDays,
): Date {
  return new Date(nowMs - Math.max(1, Math.floor(days)) * DayMs);
}

export interface RankedEntry {
  key: string;
  value: number;
}

export function topEntries(
  values: ReadonlyMap<string, number>,
  limit: number,
): RankedEntry[] {
  return Array.from(values, ([key, value]) => ({ key, value }))
    .filter((entry) => entry.value > 0)
    .sort((a, b) => b.value - a.value || a.key.localeCompare(b.key))
    .slice(0, Math.max(0, limit));
}

export function rankOf(
  values: ReadonlyMap<string, number>,
  key: string,
): { rank: number; total: number } {
  const target = values.get(key) ?? 0;
  if (target <= 0) return { rank: 0, total: 0 };
  let ahead = 0;
  let total = 0;
  for (const value of values.values()) {
    if (value <= 0) continue;
    total++;
    if (value > target) ahead++;
  }
  return { rank: ahead + 1, total };
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0m";
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  return `${minutes}m`;
}

export function formatCount(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}m`;
  if (abs >= 10_000) return `${(value / 1_000).toFixed(1)}k`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(2)}k`;
  return Math.round(value).toLocaleString("en-US");
}
