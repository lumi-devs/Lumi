import type { JobsOptions } from "bullmq";
import type { ScheduleOptions } from "#src/lib/scheduler/Schedule.js";

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
