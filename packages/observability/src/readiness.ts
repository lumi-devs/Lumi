// Readiness probe registry. `/healthz` (liveness) is always 200 while the metrics
// server responds - orchestrators use it to decide whether to restart the container.
// `/readyz` (readiness) is 200 only when every registered probe passes; k8s gates
// on it, so a failing probe pulls the replica out of the pool without killing it.
//
// Each app registers the probes it needs: worker - postgres, redis, Discord;
// scheduler - postgres, redis, BullMQ, leader-lock (if enabled); dashboard - rpc.

export type ProbeStatus = "ok" | "fail" | "skip";

export interface ProbeResult {
  status: ProbeStatus;
  detail?: string;
}

export type ProbeFn = () => ProbeResult | Promise<ProbeResult>;

interface Probe {
  name: string;
  fn: ProbeFn;
}

const probes = new Map<string, Probe>();

let draining = false;

/**
 * Flip the process into the "draining" state. /readyz will return 503 with
 * `draining: true` from this point on so the orchestrator pulls the replica
 * out of the LB / shard pool before in-flight work finishes closing.
 *
 * Idempotent. Call once at the top of the SIGTERM handler.
 */
export function markDraining(): void {
  draining = true;
}

export function isDraining(): boolean {
  return draining;
}

/** Register (or replace) a readiness probe. */
export function registerReadinessProbe(name: string, fn: ProbeFn): void {
  probes.set(name, { name, fn });
}

export interface ReadinessReport {
  ready: boolean;
  draining: boolean;
  checks: Record<string, ProbeResult>;
}

const ProbeTimeoutMs = 2000;

async function runOne(probe: Probe): Promise<ProbeResult> {
  try {
    const result = await Promise.race<ProbeResult>([
      Promise.resolve(probe.fn()),
      new Promise<ProbeResult>((resolve) =>
        setTimeout(
          () => resolve({ status: "fail", detail: "timeout" }),
          ProbeTimeoutMs,
        ),
      ),
    ]);
    return result;
  } catch (err) {
    // `/readyz` is unauthenticated, so the response carries only a fixed
    // classification; the raw error (which can embed connection strings) is
    // logged instead.
    process.stderr.write(
      `[observability] readiness probe "${probe.name}" threw: ${String(err)}\n`,
    );
    return { status: "fail", detail: "probe error" };
  }
}

export async function runReadinessProbes(): Promise<ReadinessReport> {
  const entries = [...probes.values()];
  const results = await Promise.all(
    entries.map(async (p) => [p.name, await runOne(p)] as const),
  );
  const checks: Record<string, ProbeResult> = {};
  let ready = !draining;
  for (const [name, result] of results) {
    checks[name] = result;
    if (result.status === "fail") ready = false;
  }
  return { ready, draining, checks };
}
