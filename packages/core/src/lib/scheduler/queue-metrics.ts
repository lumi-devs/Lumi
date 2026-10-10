import { container } from "@lumi/lib/services.js";
import { scheduledJobsGauge } from "@lumi/observability";
import type { ScheduledTaskRunner } from "@lumi/lib/scheduler/runner.js";

/**
 * States sampled off the shared scheduled-tasks BullMQ queue. Matches
 * `lumi_scheduled_jobs`'s `state` label values.
 */
const SAMPLED_STATES = [
  "waiting",
  "delayed",
  "active",
  "failed",
  "prioritized",
] as const;

const SAMPLE_INTERVAL_MS = 15_000;

/**
 * Periodically samples `lumi_scheduled_jobs` off the shared scheduled-tasks
 * queue through the runner's BullMQ `Queue`. Mirrors the failed-jobs
 * watcher's timer/close shape so `scheduler-container-services.ts` can start
 * and tear both down together.
 */
export function watchQueueDepth(
  runner: ScheduledTaskRunner,
): { close(): Promise<void> } {
  const sample = async () => {
    try {
      const counts = await runner.client.getJobCounts(...SAMPLED_STATES);
      for (const state of SAMPLED_STATES) {
        scheduledJobsGauge.set({ state }, counts[state] ?? 0);
      }
    } catch (err: unknown) {
      container.logger.warn("[Scheduler] Queue depth sample failed:", err);
    }
  };

  const timer = setInterval(() => void sample(), SAMPLE_INTERVAL_MS);
  timer.unref();
  void sample();

  return {
    close: () => {
      clearInterval(timer);
      return Promise.resolve();
    },
  };
}
