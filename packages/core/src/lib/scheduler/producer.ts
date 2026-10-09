import {
  getScheduledTasksConnectionOptions,
  SCHEDULED_TASKS_DEFAULT_JOB_OPTIONS,
  SCHEDULED_TASKS_QUEUE_NAME,
} from "#lib/scheduler/queue.js";
import type { Container } from "#lib/services.js";
import type { TaskQueue } from "#lib/scheduler/runner.js";
import type { ScheduleOptions } from "#lib/scheduler/schedule.js";
import { resolveTaskRef, toBullMQJobOptions } from "#lib/scheduler/job-options.js";
import { JobQueue } from "@lumi/infrastructure/queues";

export function installProducerOnlyTasks(services: Container): void {
  const queue = new JobQueue(SCHEDULED_TASKS_QUEUE_NAME, {
    connection: getScheduledTasksConnectionOptions(),
    defaultJobOptions: SCHEDULED_TASKS_DEFAULT_JOB_OPTIONS,
  });

  const handler: TaskQueue = {
    queue: SCHEDULED_TASKS_QUEUE_NAME,
    async create(task, options?: ScheduleOptions) {
      const { name, payload } = resolveTaskRef(task);
      const jobOptions = toBullMQJobOptions(options);
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
