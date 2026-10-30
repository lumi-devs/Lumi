import { matchesCron, parseCron } from "@lumi/permits";

const DurationUnits: Record<string, number> = {
  s: 1,
  m: 60,
  h: 3_600,
  d: 86_400,
  w: 604_800,
};

const MaxScanDays = 366;

const Weekdays: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function parseDuration(input: string): number | null {
  const value = input.trim().toLowerCase().replace(/\s+/g, "");
  if (value.length === 0) return null;

  if (/^\d+$/.test(value)) {
    const seconds = Number(value);
    return Number.isSafeInteger(seconds) ? seconds : null;
  }

  const pattern = /(\d+(?:\.\d+)?)\s*(s|m|h|d|w)/g;
  let total = 0;
  let consumed = 0;
  let match = pattern.exec(value);
  while (match !== null) {
    if (match.index !== consumed) return null;
    const amount = Number(match[1]);
    const unit = DurationUnits[match[2] ?? ""];
    if (!Number.isFinite(amount) || unit === undefined) return null;
    total += amount * unit;
    consumed = pattern.lastIndex;
    match = pattern.exec(value);
  }

  if (consumed !== value.length) return null;
  if (total > 365 * 24 * 60 * 60) return null;
  return Math.floor(total);
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0s";
  let remaining = Math.floor(seconds);
  if (remaining === 0) return "0s";

  const parts: string[] = [];
  for (const [unit, size] of [
    ["w", 604_800],
    ["d", 86_400],
    ["h", 3_600],
    ["m", 60],
    ["s", 1],
  ] as const) {
    const amount = Math.floor(remaining / size);
    if (amount > 0) {
      parts.push(`${amount}${unit}`);
      remaining -= amount * size;
    }
  }
  return parts.join(" ");
}

export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function validateCronExpression(
  expression: string,
): { ok: true } | { ok: false; error: string } {
  try {
    const parsed = parseCron(expression);
    if (
      parsed.minute.length === 0 ||
      parsed.hour.length === 0 ||
      parsed.dayOfMonth.length === 0 ||
      parsed.month.length === 0 ||
      parsed.dayOfWeek.length === 0
    ) {
      return { ok: false, error: "Cron expression has an empty field." };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Invalid cron expression.",
    };
  }
}

interface ZonedDateParts {
  year: number;
  month: number;
  dayOfMonth: number;
  dayOfWeek: number;
}

function zonedDateParts(date: Date, timezone?: string | null): ZonedDateParts {
  if (!timezone) {
    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      dayOfMonth: date.getUTCDate(),
      dayOfWeek: date.getUTCDay(),
    };
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "0";

  return {
    year: Number(value("year")),
    month: Number(value("month")),
    dayOfMonth: Number(value("day")),
    dayOfWeek: Weekdays[value("weekday")] ?? 0,
  };
}

function zonedTimeToUtc(
  parts: ZonedDateParts,
  hour: number,
  minute: number,
  timezone?: string | null,
): Date {
  const desired = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.dayOfMonth,
    hour,
    minute,
  );
  if (!timezone) return new Date(desired);

  let timestamp = desired;
  for (let attempt = 0; attempt < 4; attempt++) {
    const local = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
    }).formatToParts(new Date(timestamp));
    const value = (type: Intl.DateTimeFormatPartTypes): string =>
      local.find((part) => part.type === type)?.value ?? "0";
    const actual = Date.UTC(
      Number(value("year")),
      Number(value("month")) - 1,
      Number(value("day")),
      Number(value("hour")) % 24,
      Number(value("minute")),
    );
    const difference = actual - desired;
    if (difference === 0) break;
    timestamp -= difference;
  }
  return new Date(timestamp);
}

export function nextCronDate(
  expression: string,
  from: Date,
  timezone?: string | null,
): Date | null {
  const validation = validateCronExpression(expression);
  if (!validation.ok) return null;
  if (timezone && !isValidTimezone(timezone)) return null;

  const parsed = parseCron(expression);
  const anchor = Date.UTC(
    from.getUTCFullYear(),
    from.getUTCMonth(),
    from.getUTCDate(),
  );

  for (let day = 0; day <= MaxScanDays; day++) {
    const probe = new Date(anchor + day * 86_400_000);
    const dateParts = zonedDateParts(probe, timezone);
    if (
      !parsed.month.includes(dateParts.month) ||
      !parsed.dayOfMonth.includes(dateParts.dayOfMonth) ||
      !parsed.dayOfWeek.includes(dateParts.dayOfWeek)
    ) {
      continue;
    }

    let best: Date | null = null;
    for (const hour of parsed.hour) {
      for (const minute of parsed.minute) {
        const candidate = zonedTimeToUtc(dateParts, hour, minute, timezone);
        if (candidate.getTime() <= from.getTime()) continue;
        if (!matchesCron(expression, candidate, timezone ?? undefined)) continue;
        if (!best || candidate.getTime() < best.getTime()) {
          best = candidate;
        }
      }
    }
    if (best) return best;
  }

  return null;
}

export function nextIntervalDate(seconds: number, from: Date): Date | null {
  if (!Number.isInteger(seconds) || seconds < 1) return null;
  return new Date(from.getTime() + seconds * 1_000);
}

export function nextRunAt(options: {
  cron?: string | null;
  intervalSeconds?: number | null;
  timezone?: string | null;
  from?: Date;
}): Date | null {
  const from = options.from ?? new Date();
  if (options.cron) {
    return nextCronDate(options.cron, from, options.timezone);
  }
  if (options.intervalSeconds !== null && options.intervalSeconds !== undefined) {
    return nextIntervalDate(options.intervalSeconds, from);
  }
  return null;
}
