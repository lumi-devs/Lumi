import { container } from "@lumi/lib/services.js";
import { failedJobsTotal } from "@lumi/observability";
import type { ScheduledTaskRunner } from "@lumi/lib/scheduler/runner.js";
import { QueueEventsWatcher } from "@lumi/infrastructure/queues";

/**
 * Counts a scheduled-task job as failed only once it has exhausted retries.
 */
export function watchFailedJobs(
  runner: ScheduledTaskRunner,
): { close(): Promise<void> } {
  const watcher = new QueueEventsWatcher(runner.queue, {
    connection: runner.options.connection,
    logger: container.logger,
  });

  watcher.watchExhaustedRetries(
    async (jobId) => runner.client.getJob(jobId),
    (info) => {
      failedJobsTotal.inc({ task: info.name });
      container.logger.error(
        `[Scheduler] Job '${info.name}' failed after ${info.attemptsMade} attempt(s).`,
      );
    },
  );

  return { close: () => watcher.close() };
}
