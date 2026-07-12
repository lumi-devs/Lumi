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
