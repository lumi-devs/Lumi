import type { JobsOptions } from "bullmq";
import { container } from "#src/lib/Services.js";
import type { ScheduledTasks } from "#src/lib/types/Common.js";
import { wrapWithTraceContext } from "#src/lib/scheduler/Otel.js";

export const QueuePriority = {
  CRITICAL: 1,
  UTILITY: 5,
  CLEANUP: 10,
} as const;
export type QueuePriority = (typeof QueuePriority)[keyof typeof QueuePriority];

export type ScheduleOptions =
  | number
  | {
      repeated?: boolean;
      delay?: number;
      interval?: number;
      pattern?: string;
      timezone?: string;
      customJobOptions?: JobsOptions;
    };

export async function scheduleTask<N extends keyof ScheduledTasks>(
  name: N,
  payload: ScheduledTasks[N],
  options?: ScheduleOptions,
): Promise<void> {
  await container.tasks.create(
    { name, payload: wrapWithTraceContext(payload) },
    options,
  );
}
