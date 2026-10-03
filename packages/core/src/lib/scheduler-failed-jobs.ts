import { container } from "@sapphire/framework";
import { failedJobsTotal } from "@lumi/observability";
import type { ScheduledTaskHandler } from "@sapphire/plugin-scheduled-tasks";
import { QueueEvents } from "bullmq";

/**
 * Counts a scheduled-task job as failed only once it has exhausted retries.
 *
 * @remarks
 *
 * `ScheduledTaskHandler` (`@sapphire/plugin-scheduled-tasks`) never exposes
 * its internal BullMQ `Worker` instance - the field backing it is a true
 * `#private` class field (confirmed by reading the package's own `.d.mts`),
 * so a `worker.on("failed", ...)` listener isn't reachable from outside the
 * plugin at all - this is what made the old `LumiClient.ts` code that tried
 * to do exactly that permanently dead (`container.tasks.worker` is `undefined`
 * on every real instance; the "failed" listener was never actually attached).
 * `QueueEvents` gets the same information a different way: it listens to the
 * queue's own Redis-backed event stream, which every attempt (and the final
 * failure) publishes to regardless of which process's `Worker` ran the job.
 * `attemptsMade`/`opts.attempts`, read off the job via the handler's public
 * `client` getter, distinguish "one retry left" from "genuinely exhausted",
 * matching the semantics the dead code was trying to implement.
 */
export function watchFailedJobs(
  handler: ScheduledTaskHandler,
): { close(): Promise<void> } {
  const events = new QueueEvents(handler.queue, {
    connection: handler.options.connection,
  });

  events.on("error", (err: unknown) => {
    container.logger.warn("[Scheduler] QueueEvents connection error:", err);
  });

  events.on("failed", ({ jobId }) => {
    void (async () => {
      try {
        const job = await handler.client.getJob(jobId);
        const attemptsMade = job?.attemptsMade ?? 0;
        const maxAttempts = job?.opts.attempts ?? 0;
        if (attemptsMade >= maxAttempts) {
          const taskName = job?.name ?? "unknown";
          failedJobsTotal.inc({ task: taskName });
          container.logger.error(
            `[Scheduler] Job '${taskName}' failed after ${attemptsMade} attempt(s).`,
          );
        }
      } catch (err: unknown) {
        container.logger.warn(
          "[Scheduler] Failed-job metric lookup errored:",
          err,
        );
      }
    })();
  });

  return { close: () => events.close() };
}
