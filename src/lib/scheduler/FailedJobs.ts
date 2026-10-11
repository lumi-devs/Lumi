import { container } from "#src/lib/Services.js";
import { failedJobsTotal } from "#src/observability/Index.ts";
import type { ScheduledTaskRunner } from "#src/lib/scheduler/Runner.js";
import { QueueEventsWatcher } from "#src/lib/scheduler/QueueEvents.js";

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
