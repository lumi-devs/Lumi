// Next.js's documented one-time server-boot hook (App Router convention —
// https://nextjs.org/docs/app/guides/instrumentation). This replaces the
// old `apps/dashboard/src/main.ts` + `telemetry.ts` bootstrap: Next.js owns
// the process entrypoint now, so there's no `main.ts` to put this in.
//
// Mirrors what every other Lumi service does at boot (see
// apps/worker/src/main.ts, apps/scheduler/src/main.ts): OTel tracing +
// Prometheus metrics + a /healthz, /readyz, /metrics server on
// METRICS_PORT, and a readiness probe for the RabbitMQ RPC connection this
// app depends on for every guild/system page.

export async function register(): Promise<void> {
  // instrumentation.ts also loads under the edge runtime in some Next.js
  // configurations; none of this (Node net sockets, amqp) is edge-safe.
  if (process.env["NEXT_RUNTIME"] !== "nodejs") return;

  const { bootstrapTelemetry, registerReadinessProbe } = await import(
    "@lumi/observability"
  );
  bootstrapTelemetry("dashboard");

  const { getRpcClient } = await import("#/lib/rpc");
  const rpc = getRpcClient();
  registerReadinessProbe("rabbitmq", () => ({
    status: rpc.connected ? "ok" : "fail",
    detail: rpc.connected ? undefined : "not connected",
  }));
}
