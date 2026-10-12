import { markDraining } from "#src/observability/Readiness.js";

export interface DrainStep {
  name: string;
  run: () => Promise<void> | void;

  timeoutMs?: number;
}

export interface DrainOptions {
  log: (level: "info" | "warn" | "error", msg: string, meta?: object) => void;

  preCloseGraceMs?: number;

  deadlineMs?: number;

  stepTimeoutMs?: number;
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms,
    );
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

export async function runDrainSequence(
  steps: DrainStep[],
  opts: DrainOptions,
): Promise<void> {
  const {
    log,
    preCloseGraceMs = 5_000,
    deadlineMs = 30_000,
    stepTimeoutMs = 10_000,
  } = opts;

  markDraining();
  log("info", "drain started - /readyz now reports 503", {
    preCloseGraceMs,
    deadlineMs,
  });

  const started = Date.now();
  const remaining = () => Math.max(0, deadlineMs - (Date.now() - started));

  if (preCloseGraceMs > 0) {
    await new Promise((r) =>
      setTimeout(r, Math.min(preCloseGraceMs, remaining())),
    );
  }

  const deadlineTimer = setTimeout(() => {
    log("error", "drain hit hard deadline - forcing exit");
    process.exit(1);
  }, remaining());
  deadlineTimer.unref?.();

  for (const step of steps) {
    const budget = Math.min(step.timeoutMs ?? stepTimeoutMs, remaining());
    if (budget <= 0) {
      log("warn", `skipping drain step (deadline exhausted)`, {
        step: step.name,
      });
      continue;
    }
    try {
      await withTimeout(
        Promise.resolve(step.run()),
        budget,
        `drain step "${step.name}"`,
      );
      log("info", "drain step ok", { step: step.name });
    } catch (err) {
      log("warn", "drain step failed", {
        step: step.name,
        err: String(err),
      });
    }
  }

  clearTimeout(deadlineTimer);
  log("info", "drain complete", { elapsedMs: Date.now() - started });
}
