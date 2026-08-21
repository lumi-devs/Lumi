// One-call telemetry bootstrap for a service entrypoint. Import a thin side-effect
// module that calls this BEFORE any instrumented library is imported (ESM hoists
// imports, so it must live in its own module imported first in main.ts).

import { startTracing } from "./tracing";
import { startEventLoopMonitor } from "./event-loop";
import { initMetrics, startMetricsServer } from "./metrics";

// A single-host deployment runs several services off one shared `.env`, so a bare
// METRICS_PORT would have them all fight over one port. The per-service override
// wins, and `SERVICE_NAME` is normalized because env keys can't hold `-`.
function resolveMetricsPort(service: string | undefined): number {
  const scoped = service
    ? process.env[`${service.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_METRICS_PORT`]
    : undefined;
  const port = scoped ?? process.env["METRICS_PORT"];
  return port ? Number(port) : 9090;
}

export interface BootstrapTelemetryOptions {
  /**
   * Bind the `/metrics` HTTP listener. False for a non-primary
   * ShardingManager child sharing a pod with a primary that already owns
   * the port - tracing/metrics collection still runs, just unexposed.
   * Default true.
   */
  exposeHttp?: boolean;
}

export function bootstrapTelemetry(
  serviceName?: string,
  opts: BootstrapTelemetryOptions = {},
): void {
  const name =
    (serviceName && serviceName.trim().length > 0
      ? serviceName
      : undefined) ??
    process.env["SERVICE_NAME"] ??
    "lumi";

  // Pin the service name so the (later-constructed) pino logger agrees with traces/metrics.
  process.env["SERVICE_NAME"] ??= name;
  const svc = process.env["SERVICE_NAME"];

  startTracing({
    service: svc,
    version: process.env["SERVICE_VERSION"],
    endpoint: process.env["OTEL_EXPORTER_OTLP_ENDPOINT"],
    sampleRatio: process.env["OTEL_TRACES_SAMPLE_RATIO"]
      ? Number(process.env["OTEL_TRACES_SAMPLE_RATIO"])
      : undefined,
  });

  initMetrics(svc);
  startEventLoopMonitor();
  if (opts.exposeHttp ?? true) {
    startMetricsServer(resolveMetricsPort(svc));
  }
}
