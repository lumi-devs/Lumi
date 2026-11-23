export interface ParsedCron {
  readonly minute: readonly number[];
  readonly hour: readonly number[];
  readonly dayOfMonth: readonly number[];
  readonly month: readonly number[];
  readonly dayOfWeek: readonly number[];
  readonly dayOfMonthWildcard: boolean;
  readonly dayOfWeekWildcard: boolean;
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

const Months: Readonly<Record<string, number>> = {
  Jan: 1,
  Feb: 2,
  Mar: 3,
  Apr: 4,
  May: 5,
  Jun: 6,
  Jul: 7,
  Aug: 8,
  Sep: 9,
  Oct: 10,
  Nov: 11,
  Dec: 12,
};

function replaceNames(
  field: string,
  names: Readonly<Record<string, number>>,
): string {
  if (!/[A-Za-z]/.test(field)) return field;
  return field
    .toUpperCase()
    .replace(/[A-Z]{3}/g, (token) => {
      const key = token[0]! + token.slice(1).toLowerCase();
      const value = names[key];
      return value === undefined ? token : String(value);
    });
}

function parseCronField(
  field: string,
  min: number,
  max: number,
  names?: Readonly<Record<string, number>>,
): number[] {
  const normalized = names ? replaceNames(field, names) : field;
  const result: number[] = [];

  if (normalized === "*" || normalized === "?") {
    for (let i = min; i <= max; i++) result.push(i);
    return result;
  }

  for (const part of normalized.split(",")) {
    const trimmed = part.trim();
    if (trimmed.length === 0) return [];

    const slash = trimmed.indexOf("/");
    const rangePart = slash === -1 ? trimmed : trimmed.slice(0, slash);
    const stepPart = slash === -1 ? undefined : trimmed.slice(slash + 1);

    let stepNum = 1;
    if (stepPart !== undefined) {
      stepNum = Number(stepPart);
      if (!Number.isInteger(stepNum) || stepNum <= 0) return [];
    }

    let start: number;
    let end: number;
    if (rangePart === "*" || rangePart === "?") {
      start = min;
      end = max;
    } else if (rangePart.includes("-")) {
      const [rawStart, rawEnd] = rangePart.split("-");
      start = Number(rawStart);
      end = Number(rawEnd);
    } else {
      start = Number(rangePart);
      end = stepPart === undefined ? start : max;
    }

    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start > end
    ) {
      return [];
    }

    for (let i = start; i <= end; i += stepNum) {
      if (i >= min && i <= max) result.push(i);
    }
  }

  return [...new Set(result)].sort((a, b) => a - b);
}

function parseWeekdays(field: string): number[] {
  const normalized = replaceNames(field, Weekdays).replace(
    /(^|[^-\d])7(?=$|[^-\d])/g,
    "$10",
  );
  const parsed = parseCronField(normalized, 0, 6);
  return [...new Set(parsed)].sort((a, b) => a - b);
}

export function parseCron(cron: string): ParsedCron {
  const normalized = cron.trim().replace(/\s+/g, " ");
  const cached = parsedCronCache.get(normalized);
  if (cached) return cached;

  const parts = normalized.split(" ");
  if (parts.length !== 5) {
    throw new Error(`Invalid cron expression: ${cron} (expected 5 fields)`);
  }

  const [minuteField, hourField, dayOfMonthField, monthField, dayOfWeekField] =
    parts as [string, string, string, string, string];

  const parsed: ParsedCron = {
    minute: parseCronField(minuteField, 0, 59),
    hour: parseCronField(hourField, 0, 23),
    dayOfMonth: parseCronField(dayOfMonthField, 1, 31),
    month: parseCronField(monthField, 1, 12, Months),
    dayOfWeek: parseWeekdays(dayOfWeekField),
    dayOfMonthWildcard: dayOfMonthField === "*" || dayOfMonthField === "?",
    dayOfWeekWildcard: dayOfWeekField === "*" || dayOfWeekField === "?",
  };

  if (
    parsed.minute.length === 0 ||
    parsed.hour.length === 0 ||
    parsed.dayOfMonth.length === 0 ||
    parsed.month.length === 0 ||
    parsed.dayOfWeek.length === 0
  ) {
    throw new Error(`Invalid cron expression: ${cron} (field is empty)`);
  }

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

export function zonedTimeParts(
  date: Date,
  timezone?: string,
): ZonedTimeParts {
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

export function matchesCron(
  cron: string,
  date: Date,
  timezone?: string,
): boolean {
  try {
    const parsed = parseCron(cron);
    const parts = zonedTimeParts(date, timezone);

    if (
      !parsed.minute.includes(parts.minute) ||
      !parsed.hour.includes(parts.hour) ||
      !parsed.month.includes(parts.month)
    ) {
      return false;
    }

    const dayOfMonthMatches = parsed.dayOfMonth.includes(parts.dayOfMonth);
    const dayOfWeekMatches = parsed.dayOfWeek.includes(parts.dayOfWeek);

    // Vixie cron semantics: when both day fields are restricted the schedule
    // fires on either match; otherwise both fields must match.
    if (parsed.dayOfMonthWildcard || parsed.dayOfWeekWildcard) {
      return dayOfMonthMatches && dayOfWeekMatches;
    }
    return dayOfMonthMatches || dayOfWeekMatches;
  } catch {
    return false;
  }
}
