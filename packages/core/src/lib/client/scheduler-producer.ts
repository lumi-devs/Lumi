import {
  getScheduledTasksConnectionOptions,
  SCHEDULED_TASKS_DEFAULT_JOB_OPTIONS,
  SCHEDULED_TASKS_QUEUE_NAME,
} from "#lib/client/scheduled-tasks-queue.js";
import { container } from "@sapphire/framework";
import type {
  ScheduledTaskHandler,
  ScheduledTasksResolvable,
  ScheduledTasksTaskOptions,
} from "@sapphire/plugin-scheduled-tasks";
import { Queue, type JobsOptions } from "bullmq";

function resolveTask(
  task: ScheduledTasksResolvable,
): { name: string; payload: unknown } {
  if (typeof task === "string") return { name: task, payload: undefined };
  if ("payload" in task) return { name: task.name, payload: task.payload };
  return { name: task.name, payload: undefined };
}

/**
 * Producer-only stand-in for `@sapphire/plugin-scheduled-tasks`'s
 * `ScheduledTaskHandler`, installed on every shard in place of the real
 * plugin.
 *
 * @remarks
 *
 * `ScheduledTaskHandler`'s constructor builds a BullMQ `Queue` *and* `Worker`
 * unconditionally - read directly from the plugin's source, there is no
 * option to construct it producer-only. Only `apps/scheduler` may run that
 * `Worker` now (see `scheduler-container-services.ts`); every shard only
 * ever calls `.create()`/`.delete()` (`#lib/schedule-task.ts`) to enqueue a
 * job, never dispatches one. This wraps a bare `Queue` against the same
 * queue name/connection/job-option defaults `client-options.ts` already used
 * for the plugin's own `Queue`, so a job enqueued here lands exactly where
 * `apps/scheduler`'s real `ScheduledTaskHandler` drains it from.
 *
 * Only `create`/`delete`/`close` are implemented, matching the sole methods
 * anything outside this file calls on `container.tasks` on a shard
 * (`schedule-task.ts`, `LumiClient.destroy()`'s teardown) - confirmed by
 * grepping every `container.tasks.*` call site.
 */
export function installProducerOnlyTasks(): void {
  const queue = new Queue(SCHEDULED_TASKS_QUEUE_NAME, {
    connection: getScheduledTasksConnectionOptions(),
    defaultJobOptions: SCHEDULED_TASKS_DEFAULT_JOB_OPTIONS,
  });

  const handler = {
    queue: SCHEDULED_TASKS_QUEUE_NAME,
    async create(
      task: ScheduledTasksResolvable,
      options?: ScheduledTasksTaskOptions | number,
    ) {
      const { name, payload } = resolveTask(task);
      if (options === undefined) return queue.add(name, payload);
      if (typeof options === "number") {
        return queue.add(name, payload, { delay: options });
      }
      const { repeated, pattern, interval, delay, customJobOptions, timezone } =
        options;
      let jobOptions: JobsOptions = { delay, ...customJobOptions };
      if (repeated) {
        jobOptions = {
          ...jobOptions,
          repeat: interval ? { every: interval } : { pattern, tz: timezone },
        };
      }
      return queue.add(name, payload, jobOptions);
    },
    async delete(id: string) {
      const job = await queue.getJob(id);
      await job?.remove();
    },
    async close() {
      await queue.close();
    },
  };

  container.tasks = handler as unknown as ScheduledTaskHandler;
}
