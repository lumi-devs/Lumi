import {
  trace,
  context,
  type Tracer,
  type Span,
  SpanStatusCode,
} from "@opentelemetry/api";

const tracerName = "lumi-bot";
export const otelContext = context;

export interface TracingOptions {
  service?: string;
}

export function getTracer(): Tracer {
  return trace.getTracer(tracerName);
}

export function extractTraceContext(): Record<string, string> {
  return {};
}

export function injectTraceContext(): Record<string, string> {
  return {};
}

export async function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  _options: any = {},
): Promise<T> {
  const tracer = getTracer();
  const span = tracer.startSpan(name);
  try {
    const result = await fn(span);
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (err: unknown) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: err instanceof Error ? err.message : String(err),
    });
    throw err;
  } finally {
    span.end();
  }
}

export function runWithContext<T>(
  _ctx: any,
  fn: () => T,
): T {
  return fn();
}

export function initTracing(): boolean {
  return true;
}

export function startTracing(_options: any = {}): boolean {
  return true;
}

export async function shutdownTracing(): Promise<void> {}
