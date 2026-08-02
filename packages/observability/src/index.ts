// @lumi/observability - Cross-service telemetry primitives (tracing, metrics, logger).


// NOTE: extensionless relative specifiers (not "./boot.js" etc.) are
// deliberate — see the matching note in packages/contracts/src/index.ts.
// This repo's "moduleResolution": "Bundler" resolves either style
// identically for Bun/tsc, but Next.js's bundlers (apps/dashboard, which
// imports this package from its instrumentation.ts) only resolve this
// package's TS source correctly without an explicit ".js" extension.
export * from "./boot";
export * from "./context";
export * from "./event-loop";
export * from "./logger";
export * from "./metrics";
export * from "./readiness";
export * from "./shutdown";
export {
  getTracer,
  withSpan,
  shutdownTracing,
  startTracing,
  type TracingOptions,
} from "./tracing";
