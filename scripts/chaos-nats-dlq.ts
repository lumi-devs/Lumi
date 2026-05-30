#!/usr/bin/env bun
// Chaos test: NATS JetStream redelivery + DLQ parity (HARDENING P2.2).
//
// The gateway-proxy NATS leg only drives the happy path. This exercises the
// NatsJetStreamBus.deliver() failure path — the mirror of chaos-streams.ts
// scenario 2 for the NATS transport:
//
//   1. A poison message (handler always throws → never acks) is *redelivered*
//      by JetStream after ackWait, with deliveryCount climbing each time.
//   2. After maxDeliveries, the bus routes it to `<subject>.dlq` and acks the
//      original so it stops cycling.
//
// We keep the bus-level contract identical to Redis Streams: at-least-once,
// DLQ-after-N, idempotent handlers. Requires a JetStream-enabled NATS. Reads
// NATS_URL (default nats://127.0.0.1:4222).
//
// Exit-code contract (matches the other chaos scripts / verify:chaos):
//   0 → PASS · 2 → INFRA unreachable · 1 → FAIL.
//
// Run:  NATS_URL=nats://127.0.0.1:4222 bun scripts/chaos-nats-dlq.ts

import { connect, type NatsConnection } from "nats";
import { createEventBus } from "../packages/event-bus/src/factory.ts";

const NATS_URL = process.env["NATS_URL"] ?? "nats://127.0.0.1:4222";
const STREAM_NAME = "LUMI_EVENTS"; // matches NatsJetStreamBus.STREAM_NAME
const MAX_DELIVERIES = 2;
const ACK_WAIT_MS = 800; // tight so redelivery fires fast (production is 60s)

function log(stage: string, msg: string, meta?: object): void {
  console.log(
    `[chaos:${stage}] ${msg}${meta ? ` ${JSON.stringify(meta)}` : ""}`,
  );
}

let failed = false;
function assert(cond: boolean, label: string): void {
  if (cond) log("assert", `OK — ${label}`);
  else {
    failed = true;
    log("assert", `FAIL — ${label}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function pingOrExit(): Promise<NatsConnection> {
  try {
    return await connect({
      servers: NATS_URL.split(",").map((s) => s.trim()),
      maxReconnectAttempts: 3,
      reconnectTimeWait: 250,
    });
  } catch (err) {
    console.error(
      `[chaos] NATS unreachable (${String(err)}). Start a JetStream NATS and set NATS_URL.`,
    );
    process.exit(2);
  }
}

// Count messages parked on a subject via the JetStream manager (same lens the
// bus's private subjectLength uses) — avoids standing up a second consumer.
async function subjectCount(
  nc: NatsConnection,
  subject: string,
): Promise<number> {
  try {
    const jsm = await nc.jetstreamManager();
    const info = await jsm.streams.info(STREAM_NAME, {
      subjects_filter: subject,
    });
    const map = info.state.subjects ?? {};
    return map[subject] ?? 0;
  } catch {
    return 0;
  }
}

async function main(): Promise<void> {
  const inspect = await pingOrExit();
  log("env", `transport=nats url=${NATS_URL} maxDeliveries=${MAX_DELIVERIES}`);

  // Unique key per run so reruns don't share a durable/DLQ with a prior run.
  const busKey = `lumi:chaos:natsdlq:${Date.now()}`;
  const dlqSubject = `${busKey.replace(/:/g, ".")}.dlq`;

  const owned = createEventBus({
    transport: "nats",
    natsServers: NATS_URL,
    maxDeliveries: MAX_DELIVERIES,
    ackWaitMs: ACK_WAIT_MS,
    log: (level, m) => log("nats:bus", `${level} ${m}`),
  });
  const { bus } = owned;

  let attempts = 0;
  let maxDeliveryCount = 0;
  const stop = await bus.consume<{ payload: string }>(
    [busKey],
    { group: "lumi-chaos-dlq", consumer: "worker-poison", blockMs: 200 },
    (msg) => {
      attempts++;
      maxDeliveryCount = Math.max(maxDeliveryCount, msg.deliveryCount);
      // never ack → forces redelivery; reject (not async-throw) to satisfy require-await
      return Promise.reject(new Error("poison"));
    },
  );

  await bus.publish(busKey, { payload: "poison" });
  log("poison", "published", { busKey });

  // Poll until the DLQ subject gets the dead message (or we give up). Budget:
  // initial delivery + MAX_DELIVERIES redeliveries (each gated by ackWait) +
  // the DLQ-routing delivery, with generous slack.
  const deadline = Date.now() + ACK_WAIT_MS * (MAX_DELIVERIES + 3) + 4000;
  let dlq = 0;
  while (Date.now() < deadline) {
    dlq = await subjectCount(inspect, dlqSubject);
    if (dlq >= 1) break;
    await sleep(200);
  }

  log("result", "counters", { attempts, maxDeliveryCount, dlq });
  assert(
    attempts >= MAX_DELIVERIES,
    `handler invoked ≥ maxDeliveries before DLQ (got ${attempts})`,
  );
  assert(
    maxDeliveryCount >= 2,
    `deliveryCount climbed across redeliveries (max ${maxDeliveryCount})`,
  );
  assert(dlq >= 1, `poison message routed to <subject>.dlq (count=${dlq})`);

  await stop();
  await owned.close();
  await inspect.drain().catch(() => undefined);

  if (failed) {
    console.error("[chaos] FAILED");
    process.exit(1);
  }
  console.log("[chaos] PASSED");
  process.exit(0);
}

main().catch((err) => {
  console.error("[chaos] crashed:", err);
  process.exit(2);
});
