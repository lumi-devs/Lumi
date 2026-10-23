export const Time = {
  Second: 1_000,
  Minute: 60_000,
  Hour: 3_600_000,
  Day: 86_400_000,
} as const;

export function duration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / Time.Second));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
  return parts.join(" ");
}

export const formatDuration = duration;

const DurationPart =
  /(\d+(?:\.\d+)?)\s*(weeks?|w|days?|d|hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)/gi;

/**
 * Parses a human duration such as `10m`, `1h30m`, or `1 day 2 hours`.
 * Returns milliseconds, or null when any part of the input is not a duration.
 * Compound units are supported because moderation durations are often written
 * as `1d12h` rather than converted by hand.
 */
export function parseDuration(input: string): number | null {
  const text = input.trim();
  if (text.length === 0) return null;

  let total = 0;
  let consumed = 0;
  let found = false;

  for (const match of text.matchAll(DurationPart)) {
    const index = match.index ?? 0;
    const gap = text.slice(consumed, index).replace(/[\s,]/g, "");
    if (gap.length > 0) return null;

    const value = Number.parseFloat(match[1] ?? "");
    const unit = (match[2] ?? "").toLowerCase();
    if (!Number.isFinite(value) || value <= 0) return null;

    const multiplier = unit.startsWith("w")
      ? 7 * Time.Day
      : unit.startsWith("d")
        ? Time.Day
        : unit.startsWith("h")
          ? Time.Hour
          : unit.startsWith("m")
            ? Time.Minute
            : unit.startsWith("s")
              ? Time.Second
              : null;
    if (multiplier === null) return null;

    total += value * multiplier;
    consumed = index + match[0].length;
    found = true;
  }

  if (!found) return null;
  if (text.slice(consumed).replace(/[\s,]/g, "").length > 0) return null;
  if (!Number.isSafeInteger(Math.round(total))) return null;
  return Math.round(total);
}

export function since(date: Date, now = Date.now()): string {
  return duration(Math.max(0, now - date.getTime()));
}
