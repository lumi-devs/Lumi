import {
  getScheduledTasksConnectionOptions,
  SCHEDULED_TASKS_DEFAULT_JOB_OPTIONS,
  SCHEDULED_TASKS_QUEUE_NAME,
} from "#src/lib/scheduler/Queue.js";
import type { Container } from "#src/lib/Services.js";
import type { TaskQueue } from "#src/lib/scheduler/Runner.js";
import type { ScheduleOptions } from "#src/lib/scheduler/Schedule.js";
import { resolveTaskRef, toBullMQJobOptions } from "#src/lib/scheduler/JobOptions.js";
import {JobQueue} from "#src/lib/scheduler/JobQueue.js";

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
