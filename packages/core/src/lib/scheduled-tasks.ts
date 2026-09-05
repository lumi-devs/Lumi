import { container } from "@sapphire/framework";
import { ScheduledTask } from "@sapphire/plugin-scheduled-tasks";
import type { ScheduledTasks } from "#lib/types/common.js";
import { publishTaskFire } from "#lib/scheduler-bus.js";

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
   * of run. Defaults to `true` (run regardless - the historical behaviour).
   */
  catchUp?: boolean;
}

/** Default tolerance before a `catchUp: false` job is treated as stale. */
export const DefaultCatchupGraceMs = 60_000;

/**
 * Decide whether a scheduled task should run now given its catch-up policy.
 * Call at the top of a `ScheduledTask.run`; returns `false` (and logs) only when
 * the job opted out of catch-up and is overdue beyond `graceMs`.
 */
export function shouldRunNow(
  taskName: string,
  payload?: unknown,
  graceMs = DefaultCatchupGraceMs,
): boolean {
  if (!payload || typeof payload !== "object") return true;
  const meta = payload as CatchUpMeta;
  if (meta.catchUp !== false) return true;
  if (meta.scheduledFor === undefined) return true;

  const overdueBy = Date.now() - meta.scheduledFor;
  if (overdueBy <= graceMs) return true;

  container.logger.debug(
    `[ScheduledTask] Dropping overdue '${taskName}' job (overdue ${overdueBy}ms, catchUp=false).`,
  );
  return false;
}

/**
 * Scheduler-side relay task: applies the payload's catch-up policy, then
 * re-publishes the fire onto the bus (`lumi.scheduler.fire:<name>`) for a
 * worker to execute via `registerTaskFireHandler`. Every Lumi task is
 * this shape - the Discord-touching work never lives in the piece itself - so
 * subclasses declare nothing but the name (via `@ApplyOptions`) and payload
 * type: `export class FooTask extends RelayTask<"foo"> {}`.
 */
export abstract class RelayTask<
  K extends keyof ScheduledTasks,
> extends ScheduledTask<K> {
  public async run(
    payload: ScheduledTasks[K] extends never ? undefined : ScheduledTasks[K],
  ): Promise<void> {
    const name = this.name as K;
    const resolved = (payload ?? {}) as ScheduledTasks[K];
    if (!shouldRunNow(name, resolved)) return;
    await publishTaskFire(name, resolved);
  }
}
