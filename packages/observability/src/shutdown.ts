// Graceful shutdown orchestration (S6 slice 2).
//
// Each app's SIGTERM handler walks a fixed sequence:
//   1. markDraining() — /readyz flips to 503 immediately
//   2. wait `preCloseGraceMs` — gives the orchestrator / LB time to notice
//      the readiness change and stop sending new work
//   3. run drain steps (each with its own internal timeout)
//   4. exit
//
// `runDrainSteps` enforces a hard `deadlineMs` ceiling: if a step hangs the
// process still exits within bounded time. Steps run sequentially because
// closing order usually matters (e.g. detach WS handler → drain queue → close
// bus → close redis).

import { markDraining } from "./readiness.js";

export interface DrainStep {
  name: string;
  run: () => Promise<void> | void;
  /** Per-step timeout. Defaults to the global step timeout. */
  timeoutMs?: number;
}

export interface DrainOptions {
  /** Logger — usually console or a structured logger. */
  log: (level: "info" | "warn" | "error", msg: string, meta?: object) => void;
  /** Wait this long after markDraining() before running steps. Default 5s. */
  preCloseGraceMs?: number;
  /** Hard ceiling for the entire shutdown. Default 30s. */
  deadlineMs?: number;
  /** Default per-step timeout when a step doesn't set its own. Default 10s. */
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

/**
 * Run the standard drain sequence. Throws only if the deadline is hit —
 * individual step failures are logged and the rest of the sequence continues.
 */
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
  log("info", "drain started — /readyz now reports 503", {
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

  // Hard ceiling — if the whole thing hangs past `deadlineMs`, abandon and
  // exit. The caller does process.exit() after this returns either way.
  const deadlineTimer = setTimeout(() => {
    log("error", "drain hit hard deadline — forcing exit");
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
