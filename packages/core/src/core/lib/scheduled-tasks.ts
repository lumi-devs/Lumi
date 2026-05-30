import { container } from "@sapphire/framework";

/**
 * Catch-up metadata every Lumi scheduled-task payload may carry. Adapted from
 * Skyra's `catchUp` semantics: BullMQ will happily fire a delayed job the moment
 * a worker comes back up, even if its target time elapsed during a long downtime.
 * For some jobs that is correct (lift an expired mute); for others it produces a
 * thundering herd of stale work (delete a welcome message that's long irrelevant).
 *
 * Tasks opt out by setting `catchUp: false` and stamping `scheduledFor` at
 * creation time; {@link shouldRunNow} then drops jobs overdue beyond the grace.
 */
export interface CatchUpMeta {
  /** Epoch ms the job was originally meant to fire. */
  scheduledFor?: number;
  /**
   * When `false`, a job overdue by more than the grace window is dropped instead
   * of run. Defaults to `true` (run regardless — the historical behaviour).
   */
  catchUp?: boolean;
}

/** Default tolerance before a `catchUp: false` job is treated as stale. */
export const DEFAULT_CATCHUP_GRACE_MS = 60_000;

/**
 * Decide whether a scheduled task should run now given its catch-up policy.
 * Call at the top of a `ScheduledTask.run`; returns `false` (and logs) only when
 * the job opted out of catch-up and is overdue beyond `graceMs`.
 */
export function shouldRunNow(
  taskName: string,
  payload: CatchUpMeta,
  graceMs = DEFAULT_CATCHUP_GRACE_MS,
): boolean {
  if (payload.catchUp !== false) return true;
  if (payload.scheduledFor === undefined) return true;

  const overdueBy = Date.now() - payload.scheduledFor;
  if (overdueBy <= graceMs) return true;

  container.logger.debug(
    `[ScheduledTask] Dropping overdue '${taskName}' job (overdue ${overdueBy}ms, catchUp=false).`,
  );
  return false;
}
