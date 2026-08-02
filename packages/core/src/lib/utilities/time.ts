import { time, TimestampStyles } from "@discordjs/formatters";
import { Duration } from "@sapphire/time-utilities";

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

/** Parse a duration string like "10m", "2h30m", "7d" into milliseconds. Returns null if unparseable. */
export function parseDuration(str: string): number | null {
  const ms = new Duration(str).offset;
  return Number.isNaN(ms) || ms <= 0 ? null : ms;
}

export function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}
