export async function register(): Promise<void> {
  if (process.env["NEXT_RUNTIME"] !== "nodejs") return;

  const { bootstrapTelemetry, registerReadinessProbe } = await import(
    "@lumi/observability"
  );
  bootstrapTelemetry("dashboard");

  const { getRpcClient } = await import("#/lib/rpc");
  const rpc = getRpcClient();
  registerReadinessProbe("rpc", async () => {
    const ok = await rpc.healthy();
    return ok ? { status: "ok" } : { status: "fail", detail: "not reachable" };
  });
}
