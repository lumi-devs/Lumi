// Readiness probe registry. `/healthz` (liveness) is always 200 while the metrics
// server responds — orchestrators use it to decide whether to restart the container.
// `/readyz` (readiness) is 200 only when every registered probe passes; k8s and the
// cluster coordinator gate on it, so a failing probe pulls the replica out of the pool
// without killing it.
//
// Each app registers the probes it needs: gateway — redis bus, Discord WS, cluster
// joined; consumer — postgres, redis, bus consumer; worker — same + Discord; scheduler —
// postgres, redis, BullMQ, leader-lock (if enabled); api — postgres, redis, rabbitmq.

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

const PROBE_TIMEOUT_MS = 2000;

async function runOne(probe: Probe): Promise<ProbeResult> {
  try {
    const result = await Promise.race<ProbeResult>([
      Promise.resolve(probe.fn()),
      new Promise<ProbeResult>((resolve) =>
        setTimeout(
          () => resolve({ status: "fail", detail: "timeout" }),
          PROBE_TIMEOUT_MS,
        ),
      ),
    ]);
    return result;
  } catch (err) {
    return { status: "fail", detail: String(err) };
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
