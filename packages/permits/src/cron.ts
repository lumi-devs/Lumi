




export interface ParsedCron {
  readonly minute: readonly number[];
  readonly hour: readonly number[];
  readonly dayOfMonth: readonly number[];
  readonly month: readonly number[];
  readonly dayOfWeek: readonly number[];
}

export interface ZonedTimeParts {
  readonly minute: number;
  readonly hour: number;
  readonly dayOfMonth: number;
  readonly month: number;
  readonly dayOfWeek: number;
}

const MaxCachedPatterns = 500;
const MaxCachedFormatters = 64;
const parsedCronCache = new Map<string, ParsedCron>();
const formatterCache = new Map<string, Intl.DateTimeFormat>();

const Weekdays: Readonly<Record<string, number>> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};




function parseCronField(field: string, min: number, max: number): number[] {
  const result: number[] = [];

  if (field === "*") {
    for (let i = min; i <= max; i++) result.push(i);
    return result;
  }

  for (const part of field.split(",")) {
    if (part.includes("/")) {
      const [range, step] = part.split("/");
      if (range === undefined || range.length === 0) return [];
      const stepNum = Number(step);

      if (!Number.isInteger(stepNum) || stepNum <= 0) return [];

      let start = min;
      let end = max;
      if (range !== "*") {
        if (range?.includes("-")) {
          const [rangeStart, rangeEnd] = range.split("-").map(Number);
          start = rangeStart ?? min;
          end = rangeEnd ?? max;
        } else {
          start = Number(range);
          end = start;
        }
      }

      for (let i = start; i <= end; i += stepNum) {
        if (i >= min && i <= max) result.push(i);
      }
    } else if (part.includes("-")) {
      const [start, end] = part.split("-").map(Number);
      if (start === undefined || end === undefined) return [];
      for (let i = start; i <= end; i++) {
        if (i >= min && i <= max) result.push(i);
      }
    } else {
      const val = Number(part);
      if (Number.isInteger(val) && val >= min && val <= max) result.push(val);
    }
  }

  return [...new Set(result)].sort((a, b) => a - b);
}




export function parseCron(cron: string): ParsedCron {
  const normalized = cron.trim();
  const cached = parsedCronCache.get(normalized);
  if (cached) return cached;

  const parts = normalized.split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`Invalid cron expression: ${cron} (expected 5 fields)`);
  }

  const parsed: ParsedCron = {
    minute: parseCronField(parts[0]!, 0, 59),
    hour: parseCronField(parts[1]!, 0, 23),
    dayOfMonth: parseCronField(parts[2]!, 1, 31),
    month: parseCronField(parts[3]!, 1, 12),
    dayOfWeek: parseCronField(parts[4]!, 0, 6),
  };

  if (parsedCronCache.size >= MaxCachedPatterns) {
    const oldest = parsedCronCache.keys().next().value;
    if (oldest !== undefined) parsedCronCache.delete(oldest);
  }
  parsedCronCache.set(normalized, parsed);
  return parsed;
}

function formatterFor(timezone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hourCycle: "h23",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      weekday: "short",
    });


    if (formatterCache.size >= MaxCachedFormatters) {
      const oldest = formatterCache.keys().next().value;
      if (oldest !== undefined) formatterCache.delete(oldest);
    }
    formatterCache.set(timezone, formatter);
  }
  return formatter;
}




export function zonedTimeParts(date: Date, timezone?: string): ZonedTimeParts {
  if (!timezone) {
    return {
      minute: date.getUTCMinutes(),
      hour: date.getUTCHours(),
      dayOfMonth: date.getUTCDate(),
      month: date.getUTCMonth() + 1,
      dayOfWeek: date.getUTCDay(),
    };
  }

  const parts = formatterFor(timezone).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "0";

  return {

    hour: Number(value("hour")) % 24,
    minute: Number(value("minute")),
    dayOfMonth: Number(value("day")),
    month: Number(value("month")),
    dayOfWeek: Weekdays[value("weekday")] ?? 0,
  };
}

export function matchesCron(cron: string, date: Date, timezone?: string): boolean {
  try {
    const parsed = parseCron(cron);
    const parts = zonedTimeParts(date, timezone);

    return (
      parsed.minute.includes(parts.minute) &&
      parsed.hour.includes(parts.hour) &&
      parsed.dayOfMonth.includes(parts.dayOfMonth) &&
      parsed.month.includes(parts.month) &&
      parsed.dayOfWeek.includes(parts.dayOfWeek)
    );
  } catch {


    return false;
  }
}
