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

export function markDraining(): void {
  draining = true;
}

export function isDraining(): boolean {
  return draining;
}

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
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeoutPromise = new Promise<ProbeResult>((resolve) => {
      timer = setTimeout(
        () => resolve({ status: "fail", detail: "timeout" }),
        ProbeTimeoutMs,
      );
      timer.unref?.();
    });
    const probePromise = Promise.resolve()
      .then(() => probe.fn())
      .catch((err: unknown) => {
        process.stderr.write(
          `[observability] readiness probe "${probe.name}" threw: ${String(err)}\n`,
        );
        return { status: "fail" as const, detail: "probe error" };
      });
    const result = await Promise.race<ProbeResult>([probePromise, timeoutPromise]);
    return result;
  } catch (err) {

    process.stderr.write(
      `[observability] readiness probe "${probe.name}" threw: ${String(err)}\n`,
    );
    return { status: "fail", detail: "probe error" };
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
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
