import { Result, UserError } from "@sapphire/framework";
import { Duration } from "@sapphire/time-utilities";
import * as chrono from "chrono-node";

/**
 * Resolves a duration string (e.g. '1d', '5m') or natural language ('in 2 hours')
 * into a millisecond offset from now.
 */
export function resolveDuration(parameter: string): Result<number, UserError> {
  // Try structured duration first (e.g. "1d2h")
  const structured = new Duration(parameter).offset;
  if (!isNaN(structured) && structured > 0) {
    return Result.ok(structured);
  }

  // Fall back to chrono natural language (e.g. "tomorrow", "in 3 hours")
  const parsed = chrono.parseDate(parameter);
  if (parsed) {
    const offset = parsed.getTime() - Date.now();
    if (offset > 0) return Result.ok(offset);
  }

  return Result.err(
    new UserError({
      identifier: "InvalidDuration",
      message: "The provided duration is invalid or non-positive.",
    }),
  );
}

/**
 * Resolves a duration string and returns the target Date.
 */
export function resolveDurationDate(
  parameter: string,
): Result<Date, UserError> {
  return resolveDuration(parameter).map(
    (offset) => new Date(Date.now() + offset),
  );
}
