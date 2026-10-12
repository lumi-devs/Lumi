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
      repeated?: boolean | undefined;
      delay?: number | undefined;
      interval?: number | undefined;
      pattern?: string | undefined;
      timezone?: string | undefined;
      customJobOptions?: JobsOptions | undefined;
    };

export function toBullMQJobOptions(
  options?: ScheduleOptions,
): JobsOptions | undefined {
  if (options === undefined) return undefined;
  if (typeof options === "number") return { delay: options };

  const { repeated, pattern, interval, delay, customJobOptions, timezone } =
    options;
  return {
    ...(delay !== undefined ? { delay } : {}),
    ...customJobOptions,
    ...(repeated
      ? {
          repeat: interval
            ? { every: interval }
            : {
                ...(pattern !== undefined ? { pattern } : {}),
                ...(timezone !== undefined ? { tz: timezone } : {}),
              },
        }
      : {}),
  };
}

export function resolveTaskRef(
  task: string | { name: string; payload?: unknown },
): { name: string; payload?: unknown } {
  if (typeof task === "string") return { name: task, payload: undefined };
  return { name: task.name, payload: task.payload };
}

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
