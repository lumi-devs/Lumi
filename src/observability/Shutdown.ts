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
      let t: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        Promise.resolve(step.run()),
        new Promise<never>((_, reject) => {
          t = setTimeout(
            () => reject(new Error(`drain step "${step.name}" timed out after ${budget}ms`)),
            budget,
          );
          t.unref?.();
        }),
      ]).finally(() => clearTimeout(t));
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
