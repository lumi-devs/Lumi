// Event-loop delay monitoring. The single number that says whether a Node
// process is keeping up: every handler shares one loop, so lag here is lag on
// commands, heartbeats and gateway acks alike.

import { monitorEventLoopDelay, type IntervalHistogram } from "node:perf_hooks";
import { Gauge } from "prom-client";
import { registry } from "./metrics";

/** Sampling resolution; also the floor on what the histogram can report. */
const RESOLUTION_MS = 20;

/** How often the histogram is drained into the gauges. */
const REPORT_INTERVAL_MS = 10_000;

/**
 * Event-loop delay in seconds, by quantile. `max` is the one that matters for
 * gateway health: a single 5s stall drops heartbeats regardless of the median.
 */
export const eventLoopDelay = new Gauge({
  name: "lumi_event_loop_delay_seconds",
  help: "Event-loop delay observed over the last reporting window",
  labelNames: ["quantile"] as const,
  registers: [registry],
});

let histogram: IntervalHistogram | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

/**
 * Start sampling event-loop delay. Idempotent; safe to call from any entrypoint.
 * Returns a stop function (mostly for tests - the timer is `unref`'d, so it
 * never holds the process open).
 */
export function startEventLoopMonitor(
  intervalMs = REPORT_INTERVAL_MS,
): () => void {
  if (histogram) return stopEventLoopMonitor;

  const h = monitorEventLoopDelay({ resolution: RESOLUTION_MS });
  h.enable();
  histogram = h;

  const report = () => {
    // Nanoseconds → seconds, matching Prometheus base-unit convention.
    eventLoopDelay.set({ quantile: "p50" }, h.percentile(50) / 1e9);
    eventLoopDelay.set({ quantile: "p99" }, h.percentile(99) / 1e9);
    eventLoopDelay.set({ quantile: "max" }, h.max / 1e9);
    // Reset so each window reports that window, not the process lifetime.
    h.reset();
  };

  timer = setInterval(report, intervalMs);
  timer.unref?.();
  return stopEventLoopMonitor;
}

export function stopEventLoopMonitor(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  histogram?.disable();
  histogram = null;
}
