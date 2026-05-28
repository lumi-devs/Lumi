// @ember/observability — cross-service telemetry primitives. Zero discord.js deps.
//
// Boot order in an app entrypoint:
//   1. startTracing(...)        — MUST run before instrumented libs are imported
//      (import from "@ember/observability/tracing" at the very top of main.ts)
//   2. initMetrics(service) + startMetricsServer(port)
//   3. createPinoLogger(...)    — passed into the Sapphire client as its logger

export * from "./boot.js";
export * from "./context.js";
export * from "./logger.js";
export * from "./metrics.js";
export {
  getTracer,
  withSpan,
  shutdownTracing,
  startTracing,
  type TracingOptions,
} from "./tracing.js";
