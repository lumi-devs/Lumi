// OpenTelemetry tracing setup and helpers.


import {
  diag,
  DiagConsoleLogger,
  DiagLogLevel,
  trace,
  type Span,
  type SpanOptions,
  SpanStatusCode,
} from "@opentelemetry/api";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  BatchSpanProcessor,
  NodeTracerProvider,
  ParentBasedSampler,
  TraceIdRatioBasedSampler,
} from "@opentelemetry/sdk-trace-node";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";

const TRACER_NAME = "lumi";
let provider: NodeTracerProvider | null = null;

export interface TracingOptions {
  service: string;
  version?: string;
  /** OTLP/HTTP collector endpoint, e.g. http://otel-collector:4318. */
  endpoint?: string;
  /** 0..1 head sampling ratio (parent-based). Defaults to 1. */
  sampleRatio?: number;
}

/** Idempotent. No-op unless OTEL_ENABLED=true. Returns true if tracing was started. */
export function startTracing(opts: TracingOptions): boolean {
  if (process.env["OTEL_ENABLED"] !== "true") return false;
  if (provider) return true;

  if (process.env["OTEL_DIAG"] === "true") {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.WARN);
  }

  const ratio = opts.sampleRatio ?? 1;
  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: opts.service,
    ...(opts.version ? { [ATTR_SERVICE_VERSION]: opts.version } : {}),
  });

  const exporter = new OTLPTraceExporter({
    url: opts.endpoint ? `${opts.endpoint}/v1/traces` : undefined,
  });

  provider = new NodeTracerProvider({
    resource,
    sampler: new ParentBasedSampler({
      root: new TraceIdRatioBasedSampler(ratio),
    }),
    spanProcessors: [new BatchSpanProcessor(exporter)],
  });

  provider.register({
    contextManager: new AsyncLocalStorageContextManager().enable(),
    propagator: new W3CTraceContextPropagator(),
  });

  // Auto-instrument transports best-effort; never let a missing/incompatible
  // instrumentation crash boot (Bun support varies).
  try {
    void Promise.all([
      import("@opentelemetry/instrumentation-http"),
      import("@opentelemetry/instrumentation-pg"),
      import("@opentelemetry/instrumentation-ioredis"),
    ]).then(([http, pg, ioredis]) => {
      registerInstrumentations({
        instrumentations: [
          new http.HttpInstrumentation(),
          new pg.PgInstrumentation(),
          new ioredis.IORedisInstrumentation(),
        ],
      });
    });
  } catch {
    /* manual spans still work without auto-instrumentation */
  }

  return true;
}

export async function shutdownTracing(): Promise<void> {
  await provider?.shutdown().catch(() => undefined);
  provider = null;
}

export function getTracer() {
  return trace.getTracer(TRACER_NAME);
}

/** Run `fn` inside a new active span; records exceptions + ERROR status, always ends the span. */
export async function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T> | T,
  options?: SpanOptions,
): Promise<T> {
  return getTracer().startActiveSpan(name, options ?? {}, async (span) => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.recordException(err as Error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: err instanceof Error ? err.message : String(err),
      });
      throw err;
    } finally {
      span.end();
    }
  });
}
