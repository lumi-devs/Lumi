import { parseCron } from "@lumi/permits";
import type { ParsedCron } from "@lumi/permits";

const MaxLookaheadDays = 366;

export function isValidCron(cron: string): boolean {
  try {
    const parsed = parseCron(cron);
    return (
      parsed.minute.length > 0 &&
      parsed.hour.length > 0 &&
      parsed.dayOfMonth.length > 0 &&
      parsed.month.length > 0 &&
      parsed.dayOfWeek.length > 0
    );
  } catch {
    return false;
  }
}

function matches(parsed: ParsedCron, date: Date): boolean {
  return (
    parsed.minute.includes(date.getUTCMinutes()) &&
    parsed.hour.includes(date.getUTCHours()) &&
    parsed.dayOfMonth.includes(date.getUTCDate()) &&
    parsed.month.includes(date.getUTCMonth() + 1) &&
    parsed.dayOfWeek.includes(date.getUTCDay())
  );
}

export function nextCronOccurrence(
  cron: string,
  from: Date,
  maxLookaheadDays = MaxLookaheadDays,
): Date | null {
  let parsed: ParsedCron;
  try {
    parsed = parseCron(cron);
  } catch {
    return null;
  }

  const candidate = new Date(from.getTime());
  candidate.setUTCSeconds(0, 0);
  candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);
  const limit = from.getTime() + maxLookaheadDays * 86_400_000;

  while (candidate.getTime() <= limit) {
    if (matches(parsed, candidate)) return candidate;
    candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);
  }
  return null;
}
