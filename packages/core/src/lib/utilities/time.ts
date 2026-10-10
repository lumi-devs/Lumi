import { Duration, DurationFormatter } from "@sapphire/duration";

/** Parse a duration string like "10m", "2h30m", "7d" into milliseconds. Returns null if unparseable. */
export function parseDuration(str: string): number | null {
  const offset = new Duration(str).offset;
  return Number.isNaN(offset) || offset <= 0 ? null : offset;
}

const formatter = new DurationFormatter();

export function formatDuration(ms: number): string {
  return formatter.format(ms);
}
