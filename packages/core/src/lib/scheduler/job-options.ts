import type { JobsOptions } from "bullmq";
import type { ScheduleOptions } from "./schedule.js";

export function toBullMQJobOptions(
  options?: ScheduleOptions,
): JobsOptions | undefined {
  if (options === undefined) return undefined;
  if (typeof options === "number") return { delay: options };

  const { repeated, pattern, interval, delay, customJobOptions, timezone } =
    options;
  return {
    delay,
    ...customJobOptions,
    ...(repeated
      ? { repeat: interval ? { every: interval } : { pattern, tz: timezone } }
      : {}),
  };
}

export function resolveTaskRef(
  task: string | { name: string; payload?: unknown },
): { name: string; payload?: unknown } {
  if (typeof task === "string") return { name: task, payload: undefined };
  return { name: task.name, payload: task.payload };
}
