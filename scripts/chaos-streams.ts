#!/usr/bin/env bun
// Chaos test for the Redis Streams transport.
//
// Simulates a worker crashing mid-handler under streams transport, and verifies:
//   1. A peer claims the pending entry via XAUTOCLAIM after the idle window.
//   2. The redelivered message carries deliveryCount > 1.
//   3. A perpetually-failing message lands in <stream>:dlq after maxDeliveries.
//
// Requires a live Redis. Reads REDIS_HOST/PORT/PASSWORD/DB from env (same vars
// the bot uses). Run with:  bun scripts/chaos-streams.ts
//
// This is not a unit test — it pokes a real broker — so it lives under scripts/
// rather than the per-package test suites.

import { Redis } from "ioredis";
import { RedisStreamsBus } from "../packages/event-bus/src/RedisStreamsBus.js";

const TEST_STREAM = `lumi:chaos:${Date.now()}`;
const GROUP = "lumi-chaos";
const CLAIM_MIN_IDLE_MS = 500; // tight for the test; production is 60s
const MAX_DELIVERIES = 3;

function redis(): Redis {
  return new Redis({
    host: process.env["REDIS_HOST"] ?? "localhost",
    port: Number(process.env["REDIS_PORT"] ?? 6379),
    password: process.env["REDIS_PASSWORD"] || undefined,
    db: Number(process.env["REDIS_CACHE_DB"] ?? 0),
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
  });
}

function log(stage: string, msg: string, meta?: object): void {
  console.log(
    `[chaos:${stage}] ${msg}${meta ? " " + JSON.stringify(meta) : ""}`,
  );
}

async function pingOrExit(r: Redis): Promise<void> {
  try {
    await r.connect();
    await r.ping();
  } catch (err) {
    console.error(
      `[chaos] Redis unreachable (${String(err)}). Set REDIS_HOST/PORT/PASSWORD and retry.`,
    );
    process.exit(2);
  }
}

async function cleanup(r: Redis): Promise<void> {
  await Promise.allSettled([r.del(TEST_STREAM), r.del(`${TEST_STREAM}:dlq`)]);
}

let failed = false;
function assert(cond: boolean, label: string): void {
  if (cond) log("assert", `OK — ${label}`);
  else {
    failed = true;
    log("assert", `FAIL — ${label}`);
  }
}

async function main(): Promise<void> {
  const pubA = redis();
  const subA = redis();
  const pubB = redis();
  const subB = redis();
  await Promise.all([pingOrExit(pubA), pingOrExit(subA), pingOrExit(pubB), pingOrExit(subB)]);
  await cleanup(pubA);

  const log_ = (level: "info" | "warn" | "error", m: string, meta?: object) =>
    log(level, m, meta);

  // workerA: drops every message (simulates crash mid-handler).
  const busA = new RedisStreamsBus({
    publisher: pubA,
    subscriber: subA,
    maxDeliveries: MAX_DELIVERIES,
    claimMinIdleMs: CLAIM_MIN_IDLE_MS,
    claimIntervalMs: 0, // workerA never claims — workerB owns recovery
    log: log_,
  });

  // workerB: handler succeeds. Claims aggressively.
  const busB = new RedisStreamsBus({
    publisher: pubB,
    subscriber: subB,
    maxDeliveries: MAX_DELIVERIES,
    claimMinIdleMs: CLAIM_MIN_IDLE_MS,
    claimIntervalMs: 200,
    log: log_,
  });

  // ── Scenario 1: workerA "crashes" (handler throws → no ack), workerB claims.
  const deliveriesA: Array<{ id: string; n: number }> = [];
  const deliveriesB: Array<{ id: string; n: number }> = [];

  const stopA = await busA.consume<{ payload: string }>(
    [TEST_STREAM],
    { group: GROUP, consumer: "worker-A", blockMs: 200 },
    async (msg) => {
      deliveriesA.push({ id: msg.id, n: msg.deliveryCount });
      throw new Error("workerA simulated crash");
    },
  );

  const publishedId = await busA.publish(TEST_STREAM, { payload: "alive-after-crash" });
  log("scenario-1", "published", { id: publishedId });

  // Wait for workerA to receive + "crash".
  await wait(400);
  assert(
    deliveriesA.length >= 1 && deliveriesA[0]!.id === publishedId,
    "workerA received the initial delivery",
  );

  // Stop workerA's read loop so workerB has clean access. Pending entry remains.
  await stopA();
  log("scenario-1", "workerA stopped; pending entry sits in group", {
    workerA_deliveries: deliveriesA.length,
  });

  // workerB joins and should claim via XAUTOCLAIM after claimMinIdleMs.
  const stopB = await busB.consume<{ payload: string }>(
    [TEST_STREAM],
    { group: GROUP, consumer: "worker-B", blockMs: 200 },
    async (msg) => {
      deliveriesB.push({ id: msg.id, n: msg.deliveryCount });
      await msg.ack();
    },
  );

  // Give it room: idle threshold + one claim tick + Redis latency.
  await wait(CLAIM_MIN_IDLE_MS + 600);
  assert(
    deliveriesB.some((d) => d.id === publishedId),
    "workerB claimed the stalled entry",
  );
  const claimed = deliveriesB.find((d) => d.id === publishedId);
  assert(
    (claimed?.n ?? 0) >= 2,
    `redelivery deliveryCount > 1 (got ${claimed?.n ?? "—"})`,
  );

  // Stop workerB so the next scenario isn't intercepted by its acking handler.
  await stopB();

  // ── Scenario 2: poison message → DLQ after maxDeliveries.
  // Use a fresh group so the post-scenario-1 pending list doesn't muddy state.
  const POISON_GROUP = "lumi-chaos-poison";
  const POISON_STREAM = `${TEST_STREAM}:poison`;
  let poisonAttempts = 0;
  const pubP = redis();
  const subP = redis();
  await Promise.all([pingOrExit(pubP), pingOrExit(subP)]);
  const busPoison = new RedisStreamsBus({
    publisher: pubP,
    subscriber: subP,
    maxDeliveries: MAX_DELIVERIES,
    claimMinIdleMs: 200,
    claimIntervalMs: 250,
    log: log_,
  });
  // Consume first so the group is created (XGROUP CREATE ... $) before the
  // entry exists; otherwise XREADGROUP > would skip the pre-group entry.
  const stopPoison = await busPoison.consume<{ payload: string }>(
    [POISON_STREAM],
    { group: POISON_GROUP, consumer: "worker-poison", blockMs: 200 },
    async () => {
      poisonAttempts++;
      throw new Error("poison");
    },
  );
  const poisonId = await busPoison.publish(POISON_STREAM, { payload: "poison" });
  log("scenario-2", "published poison", { id: poisonId });

  // Wait long enough for: initial delivery + maxDeliveries claim cycles +
  // the final DLQ-routing tick (which fires when deliveryCount > maxDeliveries).
  await wait(250 + 350 * (MAX_DELIVERIES + 2));

  const dlqLen = await pubP.xlen(`${POISON_STREAM}:dlq`);
  assert(dlqLen >= 1, `poison message routed to DLQ (xlen=${dlqLen})`);
  assert(
    poisonAttempts >= MAX_DELIVERIES,
    `handler invoked ≥ maxDeliveries times before DLQ (got ${poisonAttempts})`,
  );

  // Cleanup.
  await stopPoison();
  await busA.close();
  await busB.close();
  await busPoison.close();
  await Promise.allSettled([
    pubP.del(POISON_STREAM),
    pubP.del(`${POISON_STREAM}:dlq`),
  ]);
  await Promise.allSettled([pubP.quit(), subP.quit()]);
  await cleanup(pubA);
  await Promise.allSettled([pubA.quit(), subA.quit(), pubB.quit(), subB.quit()]);

  if (failed) {
    console.error("[chaos] FAILED");
    process.exit(1);
  }
  console.log("[chaos] PASSED");
}

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

await main();
