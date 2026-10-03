// @lumi/observability - Cross-service telemetry primitives (tracing, metrics, logger).


// NOTE: extensionless relative specifiers (not "./boot.js" etc.) are
// deliberate — see the matching note in packages/contracts/src/index.ts.
// This repo's "moduleResolution": "Bundler" resolves either style
// identically for Bun/tsc, but Next.js's bundlers (the dashboard, which
// imports the published @lumi-devs/observability package from its
// instrumentation.ts) only resolve this package's TS source correctly
// without an explicit ".js" extension.
export * from "./boot.js";
export * from "./context.js";
export * from "./event-loop.js";
export * from "./logger.js";
export * from "./metrics.js";
export * from "./readiness.js";
export * from "./shutdown.js";
export {
  getTracer,
  withSpan,
  shutdownTracing,
  startTracing,
  type TracingOptions,
} from "./tracing.js";
