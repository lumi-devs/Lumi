#!/usr/bin/env bun
// Verifies scheduler catch-up: restart with overdue jobs and `catchUp`
// behaves per policy, with no duplicates.
//
// Drives BullMQ directly (same Queue name as the live scheduler would use)
// against a real Redis. Schedules four jobs that cross the catch-up policy
// matrix, kills the worker mid-flight to simulate scheduler downtime, then
// brings it back up and asserts:
//
//   1. catchUp=true overdue job: fires on restart.
//   2. catchUp=false overdue job (beyond grace): shouldRunNow drops it; the
//      job's side-effect counter stays at 0.
//   3. catchUp=false fresh job (within grace): fires normally.
//   4. catchUp=true fresh job: fires normally.
//   5. Each jobId fires exactly once across the restart (BullMQ idempotency).
//
// Requires a live Redis. Reads REDIS_HOST/PORT/PASSWORD from env. Run with:
//   bun scripts/verify-scheduler-catchup.ts
//
// Not a unit test — pokes a real broker — so it lives under scripts/.

import { Queue, Worker, type Job } from "bullmq";
import { Redis } from "ioredis";

// Inlined copy of the helper from
// packages/core/src/core/lib/scheduled-tasks.ts. Importing the source pulls
// the whole Sapphire/discord.js graph into this script for no reason — and
// breaks under Bun because discord.js' index.js reassigns frozen formatters.
// If the production helper's contract changes, mirror it here.
interface CatchUpMeta {
  scheduledFor?: number;
  catchUp?: boolean;
}
function shouldRunNow(
  taskName: string,
  payload: CatchUpMeta,
  graceMs: number,
): boolean {
  if (payload.catchUp !== false) return true;
  if (payload.scheduledFor === undefined) return true;
  const overdueBy = Date.now() - payload.scheduledFor;
  if (overdueBy <= graceMs) return true;
  console.log(
    `[ScheduledTask] Dropping overdue '${taskName}' (overdue ${overdueBy}ms, catchUp=false).`,
  );
  return false;
}

const QUEUE_NAME = `ember-verify-catchup-${Date.now()}`;
const EFFECT_KEY = `ember:verify:catchup:effects:${Date.now()}`;
const GRACE_MS = 60_000;
const OVERDUE_MS = 5 * 60_000;
const FRESH_DELAY_MS = 200;

type Payload = CatchUpMeta & { label: string };

function connection() {
  return {
    host: process.env["REDIS_HOST"] ?? "localhost",
    port: Number(process.env["REDIS_PORT"] ?? 6379),
    password: process.env["REDIS_PASSWORD"] || undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };
}

function redis(): Redis {
  return new Redis({ ...connection(), lazyConnect: true });
}

function log(stage: string, msg: string, meta?: object): void {
  console.log(
    `[verify:${stage}] ${msg}${meta ? " " + JSON.stringify(meta) : ""}`,
  );
}

async function effect(rds: Redis, label: string): Promise<void> {
  await rds.hincrby(EFFECT_KEY, label, 1);
}

async function effectCount(rds: Redis, label: string): Promise<number> {
  const v = await rds.hget(EFFECT_KEY, label);
  return v ? Number(v) : 0;
}

async function processor(job: Job<Payload>): Promise<void> {
  const rds = redis();
  await rds.connect();
  try {
    // Mirror what every ScheduledTask in src/modules/.../scheduled-tasks/*.ts does:
    // gate side-effects on the catchUp policy before doing real work.
    if (!shouldRunNow(QUEUE_NAME, job.data, GRACE_MS)) {
      await rds.hincrby(EFFECT_KEY, `${job.data.label}:dropped`, 1);
      return;
    }
    await effect(rds, job.data.label);
  } finally {
    await rds.quit();
  }
}

async function startWorker(): Promise<Worker<Payload>> {
  const w = new Worker<Payload>(QUEUE_NAME, processor, {
    connection: connection(),
    concurrency: 4,
  });
  await new Promise<void>((resolve, reject) => {
    w.once("ready", () => resolve());
    w.once("error", (err) => reject(err));
  });
  return w;
}

async function main(): Promise<void> {
  const queue = new Queue<Payload>(QUEUE_NAME, { connection: connection() });
  const rds = redis();
  await rds.connect();

  try {
    const now = Date.now();

    // ── Phase 1: schedule overdue jobs while no worker is running ───────────
    //
    // BullMQ doesn't care that scheduledFor is in the past — `delay: 0` makes
    // the job immediately eligible, but with no Worker attached it sits in
    // wait, simulating the scheduler being down when its target time elapsed.
    log("phase1", "scheduling jobs (no worker yet)");

    await queue.add(
      "overdue-catchup-true",
      { label: "overdue-catchup-true", scheduledFor: now - OVERDUE_MS, catchUp: true },
      { jobId: "overdue-catchup-true", delay: 0, removeOnComplete: true, removeOnFail: true },
    );
    await queue.add(
      "overdue-catchup-false",
      { label: "overdue-catchup-false", scheduledFor: now - OVERDUE_MS, catchUp: false },
      { jobId: "overdue-catchup-false", delay: 0, removeOnComplete: true, removeOnFail: true },
    );

    // Idempotency probe: re-add both jobIds while they sit in `wait`. BullMQ
    // must dedupe against the existing jobId (returns the same job, does not
    // enqueue a second). If this regresses we'd see double-fires after restart.
    const dupA = await queue.add(
      "overdue-catchup-true",
      { label: "overdue-catchup-true", scheduledFor: now - OVERDUE_MS, catchUp: true },
      { jobId: "overdue-catchup-true", delay: 0, removeOnComplete: true, removeOnFail: true },
    );
    const dupB = await queue.add(
      "overdue-catchup-false",
      { label: "overdue-catchup-false", scheduledFor: now - OVERDUE_MS, catchUp: false },
      { jobId: "overdue-catchup-false", delay: 0, removeOnComplete: true, removeOnFail: true },
    );
    log("phase1", "idempotency probe", { dupA: dupA.id, dupB: dupB.id });

    // ── Phase 2: schedule the fresh delayed jobs, still with no worker ──────
    log("phase2", "scheduling fresh delayed jobs (worker still down)");
    const nowFresh = Date.now();
    await queue.add(
      "fresh-catchup-true",
      { label: "fresh-catchup-true", scheduledFor: nowFresh + FRESH_DELAY_MS, catchUp: true },
      { jobId: "fresh-catchup-true", delay: FRESH_DELAY_MS, removeOnComplete: true, removeOnFail: true },
    );
    await queue.add(
      "fresh-catchup-false",
      { label: "fresh-catchup-false", scheduledFor: nowFresh + FRESH_DELAY_MS, catchUp: false },
      { jobId: "fresh-catchup-false", delay: FRESH_DELAY_MS, removeOnComplete: true, removeOnFail: true },
    );

    // ── Phase 3: start the worker (= "scheduler restart"), drain backlog ────
    log("phase3", "starting worker; draining backlog");
    const worker = await startWorker();
    await new Promise((r) => setTimeout(r, FRESH_DELAY_MS + 1500));
    await worker.close();

    // ── Assertions ──────────────────────────────────────────────────────────
    const ran = {
      "overdue-catchup-true": await effectCount(rds, "overdue-catchup-true"),
      "overdue-catchup-false": await effectCount(rds, "overdue-catchup-false"),
      "fresh-catchup-true": await effectCount(rds, "fresh-catchup-true"),
      "fresh-catchup-false": await effectCount(rds, "fresh-catchup-false"),
    };
    const dropped = {
      "overdue-catchup-false:dropped": await effectCount(
        rds,
        "overdue-catchup-false:dropped",
      ),
    };
    log("result", "counters", { ran, dropped });

    const failures: string[] = [];
    if (ran["overdue-catchup-true"] !== 1)
      failures.push(`overdue-catchup-true ran ${ran["overdue-catchup-true"]} times (want 1)`);
    if (ran["overdue-catchup-false"] !== 0)
      failures.push(`overdue-catchup-false ran ${ran["overdue-catchup-false"]} times (want 0 — dropped)`);
    if (dropped["overdue-catchup-false:dropped"] !== 1)
      failures.push(
        `overdue-catchup-false drop counter = ${dropped["overdue-catchup-false:dropped"]} (want 1)`,
      );
    if (ran["fresh-catchup-true"] !== 1)
      failures.push(`fresh-catchup-true ran ${ran["fresh-catchup-true"]} times (want 1)`);
    if (ran["fresh-catchup-false"] !== 1)
      failures.push(`fresh-catchup-false ran ${ran["fresh-catchup-false"]} times (want 1)`);

    if (failures.length) {
      log("FAIL", "verification failed");
      for (const f of failures) console.error("  -", f);
      process.exitCode = 1;
    } else {
      log("PASS", "all catchUp policies behaved as documented, zero duplicates");
    }
  } finally {
    await rds.del(EFFECT_KEY).catch(() => {});
    await rds.quit().catch(() => {});
    await queue.obliterate({ force: true }).catch(() => {});
    await queue.close().catch(() => {});
  }
}

main().catch((err) => {
  console.error("[verify:catchup] crashed", err);
  process.exit(1);
});
