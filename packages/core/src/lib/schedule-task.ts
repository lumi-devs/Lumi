import { container } from "@sapphire/framework";
import type { ScheduledTasks } from "#lib/types/common.js";

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
      };
    };

/**
 * Enqueue a BullMQ job. Every role that boots a client owns a BullMQ worker
 * against the shared queue, so the enqueue is always local: the job is durable
 * in Redis the moment this resolves, and whichever replica BullMQ hands it to
 * relays the fire onto the bus for a worker to execute.
 */
export async function scheduleTask<N extends keyof ScheduledTasks>(
  name: N,
  payload: ScheduledTasks[N],
  options?: ScheduleOptions,
): Promise<void> {
  await container.tasks.create(
    { name, payload },
    options as Parameters<typeof container.tasks.create>[1],
  );
}

export async function cancelTask(jobId: string): Promise<void> {
  await container.tasks.delete(jobId);
}
