import { container } from "@sapphire/framework";
import { failedJobsTotal } from "@lumi/observability";
import type { ScheduledTaskHandler } from "@sapphire/plugin-scheduled-tasks";
import { QueueEventsWatcher } from "@lumi/infrastructure/queues";

/**
 * Counts a scheduled-task job as failed only once it has exhausted retries.
 */
export function watchFailedJobs(
  handler: ScheduledTaskHandler,
): { close(): Promise<void> } {
  const watcher = new QueueEventsWatcher(handler.queue, {
    connection: handler.options.connection,
    logger: container.logger,
  });

  watcher.watchExhaustedRetries(
    async (jobId) => handler.client.getJob(jobId),
    (info) => {
      failedJobsTotal.inc({ task: info.name });
      container.logger.error(
        `[Scheduler] Job '${info.name}' failed after ${info.attemptsMade} attempt(s).`,
      );
    },
  );

  return { close: () => watcher.close() };
}
