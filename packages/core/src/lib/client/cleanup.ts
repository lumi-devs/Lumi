import { container } from "@sapphire/framework";

/**
 * Builds the rejection handler every teardown step attaches to its promise. A
 * failing step is logged at `warn` and swallowed so one unreachable resource
 * cannot abort the rest of the shutdown sequence.
 *
 * @param what - Name of the step, interpolated into the log line.
 */
export function warnOnCleanupError(what: string) {
  return (err: unknown) =>
    container.logger.warn(`[Client] ${what} failed:`, err);
}
