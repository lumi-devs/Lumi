// One-call telemetry bootstrap for a service entrypoint. Import a thin side-effect
// module that calls this BEFORE any instrumented library is imported (ESM hoists
// imports, so it must live in its own module imported first in main.ts).

import { startTracing } from "./tracing.js";
import { initMetrics, startMetricsServer } from "./metrics.js";

export function bootstrapTelemetry(serviceName?: string): void {
  const name =
    (serviceName && serviceName.trim().length > 0
      ? serviceName
      : undefined) ??
    process.env["SERVICE_NAME"] ??
    process.env["LUMI_ROLE"] ??
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
  startMetricsServer(
    process.env["METRICS_PORT"] ? Number(process.env["METRICS_PORT"]) : 9090,
  );
}
