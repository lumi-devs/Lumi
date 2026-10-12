import { startTracing } from "#src/observability/Tracing.js";
import { startEventLoopMonitor } from "#src/observability/EventLoop.js";
import { initMetrics, startMetricsServer } from "#src/observability/Metrics.js";
import { startSentry } from "#src/observability/Sentry.js";

function resolveMetricsPort(service: string | undefined): number {
  const scoped = service
    ? process.env[`${service.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_METRICS_PORT`]
    : undefined;
  const port = scoped ?? process.env["METRICS_PORT"];
  return port ? Number(port) : 9090;
}

export interface BootstrapTelemetryOptions {

  exposeHttp?: boolean;
}

export function bootstrapTelemetry(
  serviceName?: string,
  opts: BootstrapTelemetryOptions = {},
): void {
  const name = (serviceName?.trim() ? serviceName : undefined) ?? process.env["SERVICE_NAME"] ?? "lumi";

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
  startSentry();
  if (opts.exposeHttp ?? true) {
    startMetricsServer(resolveMetricsPort(svc));
  }
}
