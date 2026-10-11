import { container } from "#src/lib/Services.js";
import { scheduledJobsGauge } from "#src/observability/Index.ts";
import type { ScheduledTaskRunner } from "#src/lib/scheduler/Runner.js";

const SAMPLED_STATES = [
  "waiting",
  "delayed",
  "active",
  "failed",
  "prioritized",
] as const;

const SAMPLE_INTERVAL_MS = 15_000;

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
