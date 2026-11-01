export const MaxReminderDurationMs = 365 * 24 * 60 * 60 * 1000;

const UnitMs: Readonly<Record<string, number>> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
};

const DurationShape = /^(\d+\s*[smhdw]\s*)+$/i;
const DurationToken = /(\d+)\s*([smhdw])/gi;

export class DurationParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DurationParseError";
  }
}

export function parseDuration(input: string): number {
  const value = input.trim();
  if (value.length === 0) {
    throw new DurationParseError(
      "Enter a duration such as `10m`, `2h`, or `1h30m`.",
    );
  }
  if (!DurationShape.test(value)) {
    throw new DurationParseError(
      "Use a duration like `10s`, `5m`, `2h`, `3d`, `1w`, or `1h30m`.",
    );
  }

  let total = 0;
  for (const match of value.matchAll(DurationToken)) {
    const amount = Number(match[1]);
    const unit = (match[2] ?? "").toLowerCase();
    const multiplier = UnitMs[unit];
    if (!Number.isFinite(amount) || multiplier === undefined) {
      throw new DurationParseError("That duration is not valid.");
    }
    total += amount * multiplier;
  }

  if (total <= 0) {
    throw new DurationParseError("The duration must be greater than zero.");
  }
  if (total > MaxReminderDurationMs) {
    throw new DurationParseError(
      "Reminders can be scheduled at most one year ahead.",
    );
  }
  return total;
}

export function formatDuration(ms: number): string {
  let remaining = Math.max(0, Math.floor(ms / 1_000));
  if (remaining === 0) return "0s";

  const parts: string[] = [];
  for (const [unit, size] of [
    ["w", 604_800],
    ["d", 86_400],
    ["h", 3_600],
    ["m", 60],
    ["s", 1],
  ] as const) {
    const count = Math.floor(remaining / size);
    if (count > 0) {
      parts.push(`${count}${unit}`);
      remaining -= count * size;
    }
  }
  return parts.join(" ");
}
