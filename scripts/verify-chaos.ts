#!/usr/bin/env bun
/**
 * verify:chaos — aggregate runner for the distributed-path chaos/verify scripts.
 *
 * Runs each Redis-backed scenario sequentially against the Redis pointed to by
 * REDIS_HOST/PORT/PASSWORD/DB (default localhost:6379), surfaces a clear per-
 * script PASS/FAIL/INFRA line + a final summary, and exits non-zero if any leg
 * failed or could not reach its infra. This is the "one documented command"
 * (HARDENING P2.1) the CI `chaos` job invokes against ephemeral Redis (+NATS).
 *
 * Exit-code contract honored from the individual scripts:
 *   0 → PASS · 2 → INFRA unreachable (Redis/NATS down) · anything else → FAIL.
 *
 * NOT included here (need credentials / extra infra — run them by hand):
 *   - scripts/loadtest-rest.ts          → needs a real BOT_TOKEN + a running nirn-proxy.
 *   - chaos-gateway-proxy TRANSPORT=nats → opt-in via WITH_NATS=1 / NATS_URL=… (the
 *     JetStream leg, HARDENING P2.2); needs a JetStream-enabled NATS server.
 *
 * Usage:
 *   REDIS_HOST=127.0.0.1 REDIS_PORT=6379 bun run verify:chaos
 *   WITH_NATS=1 NATS_URL=nats://127.0.0.1:4222 bun run verify:chaos   # also run the NATS leg
 */
import { spawnSync } from "node:child_process";

interface Step {
  name: string;
  script: string;
  env?: Record<string, string>;
}

type Outcome = "PASS" | "FAIL" | "INFRA";

const REDIS_STEPS: Step[] = [
  { name: "streams DLQ / redelivery", script: "scripts/chaos-streams.ts" },
  { name: "cluster assignment / resume", script: "scripts/chaos-cluster.ts" },
  { name: "rolling-deploy drain", script: "scripts/chaos-rolling-deploy.ts" },
  { name: "autoscale KEDA signal", script: "scripts/chaos-autoscale.ts" },
  {
    name: "gateway-proxy (streams)",
    script: "scripts/chaos-gateway-proxy.ts",
    env: { TRANSPORT: "streams" },
  },
  { name: "scheduler catch-up", script: "scripts/verify-scheduler-catchup.ts" },
];

const NATS_STEP: Step = {
  name: "gateway-proxy (nats / JetStream)",
  script: "scripts/chaos-gateway-proxy.ts",
  env: { TRANSPORT: "nats" },
};

function classify(code: number): Outcome {
  if (code === 0) return "PASS";
  if (code === 2) return "INFRA";
  return "FAIL";
}

function run(step: Step): Outcome {
  const started = Date.now();
  console.log(`\n──────── ${step.name}  (${step.script}) ────────`);
  const res = spawnSync("bun", [step.script], {
    env: { ...process.env, ...step.env },
    stdio: "inherit",
  });
  // status is null when the child was killed by a signal — treat as a failure.
  const code = res.status ?? 1;
  const outcome = classify(code);
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  console.log(
    `──────── ${step.name}: ${outcome} (exit ${code}, ${secs}s) ────────`,
  );
  return outcome;
}

const steps = [...REDIS_STEPS];
if (process.env["WITH_NATS"] === "1" || process.env["NATS_URL"]) {
  steps.push(NATS_STEP);
}

const results: Array<{ step: Step; outcome: Outcome }> = [];
for (const step of steps) {
  const outcome = run(step);
  results.push({ step, outcome });
  if (outcome === "INFRA") {
    const host = process.env["REDIS_HOST"] ?? "localhost";
    const port = process.env["REDIS_PORT"] ?? "6379";
    console.error(
      `\n[verify:chaos] "${step.name}" reported infra unreachable (exit 2). ` +
        `Is Redis up at ${host}:${port} (and NATS, if WITH_NATS)? Aborting the rest.`,
    );
    break;
  }
}

console.log("\n════════ verify:chaos summary ════════");
for (const { step, outcome } of results) {
  const mark = outcome === "PASS" ? "✅" : outcome === "INFRA" ? "🔌" : "❌";
  console.log(`  ${mark} ${outcome.padEnd(5)} ${step.name}`);
}
const passed = results.filter((r) => r.outcome === "PASS").length;
const notRun = steps.length - results.length;
console.log(
  `  ── ${passed}/${steps.length} passed${notRun ? `, ${notRun} not run (aborted)` : ""}`,
);

const ok =
  results.length === steps.length && results.every((r) => r.outcome === "PASS");
process.exit(ok ? 0 : 1);
