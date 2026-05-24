import { Result, UserError } from "@sapphire/framework";
import { Duration } from "@sapphire/time-utilities";

/**
 * Resolves a duration string (e.g. '1d', '5m') into a Date object or milliseconds.
 */
export function resolveDuration(parameter: string): Result<number, UserError> {
  const duration = new Duration(parameter).offset;

  if (isNaN(duration) || duration <= 0) {
    return Result.err(
      new UserError({
        identifier: "InvalidDuration",
        message: "The provided duration is invalid or non-positive.",
      }),
    );
  }

  return Result.ok(duration);
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
