import { container } from "#src/lib/Services.js";
import type { ScheduledTasks } from "#src/lib/types/Common.js";

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
      customJobOptions?: any;
    };

export function resolveTaskRef(task: string | { name: string; payload?: unknown }) {
  if (typeof task === "string") return { name: task, payload: undefined };
  return { name: task.name, payload: task.payload };
}

export async function scheduleTask<N extends keyof ScheduledTasks>(
  name: N,
  payload: ScheduledTasks[N],
  options?: ScheduleOptions,
): Promise<void> {
  await container.tasks.create({ name, payload }, options);
}
