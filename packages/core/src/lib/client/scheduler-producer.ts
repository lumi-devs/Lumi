import {
  getScheduledTasksConnectionOptions,
  SCHEDULED_TASKS_DEFAULT_JOB_OPTIONS,
  SCHEDULED_TASKS_QUEUE_NAME,
} from "#lib/client/scheduled-tasks-queue.js";
import type { Container } from "#lib/services.js";
import type {
  CreateTaskOptions,
  TaskQueue,
} from "#lib/scheduler-runner.js";
import { JobQueue, type QueueJobOptions } from "@lumi/infrastructure/queues";

function resolveTask(task: string | { name: string; payload?: unknown }): {
  name: string;
  payload: unknown;
} {
  if (typeof task === "string") return { name: task, payload: undefined };
  if ("payload" in task) return { name: task.name, payload: task.payload };
  return { name: task.name, payload: undefined };
}

export function installProducerOnlyTasks(services: Container): void {
  const queue = new JobQueue(SCHEDULED_TASKS_QUEUE_NAME, {
    connection: getScheduledTasksConnectionOptions(),
    defaultJobOptions: SCHEDULED_TASKS_DEFAULT_JOB_OPTIONS,
  });

  const handler: TaskQueue = {
    queue: SCHEDULED_TASKS_QUEUE_NAME,
    async create(task, options?: CreateTaskOptions) {
      const { name, payload } = resolveTask(task);
      if (options === undefined) return queue.add(name, payload);
      if (typeof options === "number") {
        return queue.add(name, payload, { delay: options });
      }
      const { repeated, pattern, interval, delay, customJobOptions, timezone } =
        options;
      let jobOptions: QueueJobOptions = { delay, ...customJobOptions };
      if (repeated) {
        jobOptions = {
          ...jobOptions,
          repeat: interval ? { every: interval } : { pattern, tz: timezone },
        };
      }
      return queue.add(name, payload, jobOptions);
    },
    async delete(id: string) {
      await queue.delete(id);
    },
    async close() {
      await queue.close();
    },
  };

  services.tasks = handler;
}
