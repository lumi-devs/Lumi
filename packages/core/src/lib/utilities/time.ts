import { time, TimestampStyles } from "@discordjs/formatters";

/** Discord relative timestamp markup: `<t:EPOCH:R>` → "2 hours ago". */
export function relativeTimestamp(date: Date | number = new Date()): string {
  const d = typeof date === "number" ? new Date(date) : date;
  return time(d, TimestampStyles.RelativeTime);
}

/** Discord short-time timestamp markup: `<t:EPOCH:t>` → "14:30". */
export function shortTimestamp(date: Date | number = new Date()): string {
  const d = typeof date === "number" ? new Date(date) : date;
  return time(d, TimestampStyles.ShortTime);
}

const UnitMs: Record<string, number> = {
  ms: 1,
  millisecond: 1,
  milliseconds: 1,
  s: 1_000,
  sec: 1_000,
  secs: 1_000,
  second: 1_000,
  seconds: 1_000,
  m: 60_000,
  min: 60_000,
  mins: 60_000,
  minute: 60_000,
  minutes: 60_000,
  h: 3_600_000,
  hr: 3_600_000,
  hrs: 3_600_000,
  hour: 3_600_000,
  hours: 3_600_000,
  d: 86_400_000,
  day: 86_400_000,
  days: 86_400_000,
  w: 604_800_000,
  week: 604_800_000,
  weeks: 604_800_000,
  mo: 2_592_000_000,
  month: 2_592_000_000,
  months: 2_592_000_000,
  y: 31_536_000_000,
  yr: 31_536_000_000,
  yrs: 31_536_000_000,
  year: 31_536_000_000,
  years: 31_536_000_000,
};

const DurationPattern =
  /(\d+(?:\.\d+)?)\s*(milliseconds?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|months?|mo|years?|yrs?|y)(?![a-zA-Z])/gi;

/** Parse a duration string like "10m", "2h30m", "7d" into milliseconds. Returns null if unparseable. */
export function parseDuration(str: string): number | null {
  let total = 0;
  let matched = false;
  DurationPattern.lastIndex = 0;
  for (const m of str.matchAll(DurationPattern)) {
    const amount = m[1];
    const unitName = m[2]?.toLowerCase();
    const unit = unitName === undefined ? undefined : UnitMs[unitName];
    if (amount === undefined || unit === undefined) return null;
    matched = true;
    total += Number.parseFloat(amount) * unit;
  }
  return !matched || Number.isNaN(total) || total <= 0 ? null : total;
}

export function formatDuration(ms: number): string {
  const s = Math.floor(Math.max(0, ms) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}
