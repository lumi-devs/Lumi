import { Duration } from "@sapphire/time-utilities";
import { time, TimestampStyles } from "@discordjs/formatters";

function formatDuration(ms: number): string {
  if (ms <= 0) return "0s";
  const seconds = Math.floor(ms / 1000) % 60;
  const minutes = Math.floor(ms / 60000) % 60;
  const hours = Math.floor(ms / 3600000) % 24;
  const days = Math.floor(ms / 86400000);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);

  return parts.join(" ");
}

/** Convert a duration in seconds into a compact human-readable string. */
export function humanizeDelta(seconds: number): string {
  return formatDuration(seconds * 1000);
}

/** Convert milliseconds into a compact uptime string. */
export function formatUptime(ms: number): string {
  return formatDuration(ms);
}

/** Parse a duration string like "7d", "2h30m" into seconds. Returns null if unparseable. */
export function parseDuration(input: string): number | null {
  const duration = new Duration(input).offset;
  return isNaN(duration) || duration <= 0 ? null : Math.floor(duration / 1000);
}

/** Discord relative timestamp markup: `<t:EPOCH:R>` → "2 hours ago". */
export function relativeTimestamp(date: Date | number = new Date()): string {
  const d = typeof date === "number" ? new Date(date) : date;
  return time(d, TimestampStyles.RelativeTime);
}

/** Discord short-time timestamp markup: `<t:EPOCH:T>` → "14:30:00". */
export function shortTimestamp(date: Date | number = new Date()): string {
  const d = typeof date === "number" ? new Date(date) : date;
  return time(d, TimestampStyles.ShortTime);
}
