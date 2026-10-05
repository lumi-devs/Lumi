import { container } from "@sapphire/framework";
import type { ScheduledTasks } from "#lib/types/common.js";
import { wrapWithTraceContext } from "#lib/scheduler-otel.js";

/**
 * BullMQ priority values for the single shared scheduled-tasks queue (lower
 * runs sooner). A job with no `priority` set is not "unprioritized" in the
 * neutral sense - BullMQ always drains its wait list ahead of the prioritized
 * set, so it would jump ahead of even `CRITICAL`. `SCHEDULED_TASKS_DEFAULT_JOB_OPTIONS`
 * (`#lib/client/scheduled-tasks-queue.js`) defaults every job to `UTILITY` for
 * that reason; a call site only needs this to move a job off that default.
 */
export const QueuePriority = {
  CRITICAL: 1,
  UTILITY: 5,
  CLEANUP: 10,
} as const;
export type QueuePriority = (typeof QueuePriority)[keyof typeof QueuePriority];

/**
 * Forwarded verbatim to `container.tasks.create(task, options)`. Either a ms
 * delay (number) or the full options bag with `customJobOptions.jobId` for
 * idempotency / cancel-by-id.
 */
export type ScheduleOptions =
  | number
  | {
      repeated?: boolean;
      delay?: number;
      interval?: number;
      pattern?: string;
      timezone?: string;
      customJobOptions?: {
        jobId?: string;
        removeOnComplete?: boolean | number;
        removeOnFail?: boolean | number;
        priority?: number;
      };
    };

/**
 * Enqueue a BullMQ job. Every role that boots a client owns a BullMQ worker
 * against the shared queue, so the enqueue is always local: the job is durable
 * in Valkey the moment this resolves, and whichever replica BullMQ hands it to
 * relays the fire onto the bus for a worker to execute.
 */
export async function scheduleTask<N extends keyof ScheduledTasks>(
  name: N,
  payload: ScheduledTasks[N],
  options?: ScheduleOptions,
): Promise<void> {
  await container.tasks.create(
    { name, payload: wrapWithTraceContext(payload) } as Parameters<
      typeof container.tasks.create
    >[0],
    options as Parameters<typeof container.tasks.create>[1],
  );
}

export async function cancelTask(jobId: string): Promise<void> {
  await container.tasks.delete(jobId);
}
