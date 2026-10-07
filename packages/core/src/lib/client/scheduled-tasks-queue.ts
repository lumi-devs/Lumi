import { parseValkeyConnectionOption } from "#lib/database/valkey.js";
import { envParseInteger } from "#lib/env.js";
import { QueuePriority } from "#lib/schedule-task.js";
import type { QueueConnectionOptions as ConnectionOptions } from "@lumi/infrastructure/queues";

/**
 * The BullMQ queue name shared by the producer-only stand-in on shards and
 * the real runner in `apps/scheduler`, so a job enqueued from a shard lands
 * where the scheduler drains it from.
 */
export const SCHEDULED_TASKS_QUEUE_NAME = "scheduled-tasks";

/**
 * The Valkey connection every scheduled-tasks BullMQ `Queue`/`Worker` in the
 * fleet must share, kept in one place so `client-options.ts`,
 * `api-container-services.ts`, `scheduler-container-services.ts` and
 * `scheduler-producer.ts` can't drift from each other.
 */
export function getScheduledTasksConnectionOptions(): ConnectionOptions {
  return {
    ...parseValkeyConnectionOption(),
    db: envParseInteger("VALKEY_TASK_DB", 1),
  };
}

/**
 * The default job options every scheduled-tasks BullMQ `Queue` in the fleet
 * must share (see `getScheduledTasksConnectionOptions()`).
 *
 * @remarks
 *
 * `priority` defaults to `UTILITY` here, not in `scheduleTask()` itself,
 * because BullMQ's `Queue.add()` merges `{ ...defaultJobOptions, ...opts }` -
 * a per-call `customJobOptions.priority` still wins, but a call that omits it
 * lands on `UTILITY` instead of the unprioritized "runs before everything,
 * even `CRITICAL`" bucket BullMQ gives jobs with no priority at all.
 */
export const SCHEDULED_TASKS_DEFAULT_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: "exponential", delay: 5_000 },
  removeOnComplete: 1_000,
  removeOnFail: 5_000,
  priority: QueuePriority.UTILITY,
} as const;
