import { parseValkeyConnectionOption } from "#src/lib/valkey/Client.js";
import { envParseInteger } from "#src/lib/Env.js";
import { QueuePriority } from "#src/lib/scheduler/Schedule.js";
import type { QueueConnectionOptions as ConnectionOptions } from "#src/lib/scheduler/QueueTypes.js";

export const SCHEDULED_TASKS_QUEUE_NAME = "scheduled-tasks";

export function getScheduledTasksConnectionOptions(): ConnectionOptions {
  return {
    ...parseValkeyConnectionOption(),
    db: envParseInteger("VALKEY_TASK_DB", 1),
  };
}

export const SCHEDULED_TASKS_DEFAULT_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: "exponential", delay: 5_000 },
  removeOnComplete: 100,
  removeOnFail: 1_000,
  priority: QueuePriority.UTILITY,
} as const;
