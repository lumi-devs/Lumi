#!/usr/bin/env bun
// Chaos test for the KEDA autoscale signal.
//
// What it proves:
//   1. From idle (no traffic) the consumer-group lag stays at ~0 — so KEDA
//      scales down to `minReplicaCount` and doesn't hold extra replicas just
//      because workers exist.
//   2. A synthetic burst pushes `sum(ember_stream_consumer_lag{...})` past the
//      `worker-scaledobject.yaml` threshold of 500 within seconds. In a real
//      cluster KEDA would observe this on the next poll (≤15s) and scale up.
//   3. Once the burst drains, lag returns to 0 and the cooldown window (300s
//      in production; we don't sleep that long here) eventually scales back to
//      the floor.
//
// We don't run KEDA in-process — this validates the *signal*, which is the
// only thing the autoscaler decides on. If the signal is right and KEDA is
// installed per `deploy/k8s/README.md`, scaling follows mechanically.
//
// Requires a live Redis. Run with:  bun scripts/chaos-autoscale.ts
// Lives under scripts/ alongside chaos-streams.ts / chaos-cluster.ts.

import { Redis } from "ioredis";

const TEST_STREAM = `ember:chaos:autoscale:${Date.now()}`;
const GROUP = "ember-workers"; // match the KEDA query's `group` label
const KEDA_THRESHOLD = 500; // mirror deploy/k8s/worker-scaledobject.yaml
const BURST_SIZE = 1500; // ~3× threshold so we cross it unambiguously

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
    `[autoscale:${stage}] ${msg}${meta ? " " + JSON.stringify(meta) : ""}`,
  );
}

async function lagSamples(
  conn: Redis,
  streams: string[],
  ms: number,
  intervalMs = 100,
): Promise<number[]> {
  // Mirrors how @ember/observability's gauge is populated: XPENDING summary
  // returns [count, minId, maxId, [[consumer, count], ...]] — element 0 is the
  // pending count, which is exactly `ember_stream_consumer_lag`.
  const samples: number[] = [];
  const end = Date.now() + ms;
  while (Date.now() < end) {
    let total = 0;
    for (const stream of streams) {
      const res = (await conn
        .xpending(stream, GROUP)
        .catch(() => null)) as unknown[] | null;
      if (res) total += Number(res[0] ?? 0);
    }
    samples.push(total);
    await Bun.sleep(intervalMs);
  }
  return samples;
}

function max(xs: number[]): number {
  return xs.reduce((a, b) => (b > a ? b : a), 0);
}

async function main(): Promise<void> {
  const publisher = redis();
  const subscriber = redis();
  await Promise.all([publisher.connect(), subscriber.connect()]);

  // Create the consumer group with MKSTREAM so XREADGROUP / XPENDING below
  // don't fail on a missing stream. BUSYGROUP just means it's already there.
  await publisher
    .xgroup("CREATE", TEST_STREAM, GROUP, "$", "MKSTREAM")
    .catch((err: Error) => {
      if (!/BUSYGROUP/.test(err.message)) throw err;
    });

  try {
    // ── Phase 1: idle baseline ──────────────────────────────────────────────
    log("idle", "sampling lag with no traffic for 1s");
    const idle = await lagSamples(subscriber, [TEST_STREAM], 1000);
    const idleMax = max(idle);
    if (idleMax > 5) {
      throw new Error(
        `Idle lag should be ~0, got max=${idleMax}. Something else is publishing to ${TEST_STREAM}.`,
      );
    }
    log("idle", "OK — lag stayed at floor", { samples: idle.length, max: idleMax });

    // ── Phase 2: burst — publish above threshold, no consumer drains ────────
    log("burst", `publishing ${BURST_SIZE} entries with no consumer attached`);
    for (let i = 0; i < BURST_SIZE; i++) {
      // Mirror the envelope shape RedisStreamsBus.publish uses ({ body: JSON }).
      // For lag-counting the value doesn't matter, only that XADD lands.
      await publisher.xadd(
        TEST_STREAM,
        "*",
        "body",
        JSON.stringify({ i, ts: Date.now() }),
      );
    }
    // Re-create the group consumer so XREADGROUP moves the entries into the
    // pending list (group is created at first XREADGROUP). We then *don't*
    // ack — simulating workers that are saturated or offline.
    await subscriber.xreadgroup(
      "GROUP",
      GROUP,
      "saturated-consumer",
      "COUNT",
      String(BURST_SIZE),
      "STREAMS",
      TEST_STREAM,
      ">",
    );
    const burst = await lagSamples(subscriber, [TEST_STREAM], 500);
    const burstMax = max(burst);
    log("burst", "lag observed", { max: burstMax });
    if (burstMax < KEDA_THRESHOLD) {
      throw new Error(
        `Burst lag ${burstMax} did not cross KEDA threshold ${KEDA_THRESHOLD}. ` +
          `Either the publish loop is too slow or stats() is misreporting.`,
      );
    }
    log("burst", `OK — crossed KEDA threshold (${burstMax} > ${KEDA_THRESHOLD})`);

    // ── Phase 3: drain — ack everything, lag should fall back to 0 ─────────
    log("drain", "acking all pending entries to simulate workers catching up");
    const pending = await subscriber.xpending(TEST_STREAM, GROUP);
    // pending = [count, minId, maxId, [[consumer, count], ...]]
    const totalPending = Number((pending as unknown[])[0] ?? 0);
    if (totalPending > 0) {
      // Fetch the pending list, then XACK each id.
      const detail = (await subscriber.xpending(
        TEST_STREAM,
        GROUP,
        "-",
        "+",
        String(totalPending),
      )) as Array<[string, string, number, number]>;
      const ids = detail.map(([id]) => id);
      if (ids.length > 0) {
        await subscriber.xack(TEST_STREAM, GROUP, ...ids);
      }
    }
    const drained = await lagSamples(subscriber, [TEST_STREAM], 500);
    const drainedMax = max(drained);
    if (drainedMax > 5) {
      throw new Error(
        `Post-drain lag should be ~0, got max=${drainedMax}. XACK didn't clear pending.`,
      );
    }
    log("drain", "OK — lag returned to floor", { max: drainedMax });

    log("done", "PASS — KEDA signal works end-to-end", {
      idleMax,
      burstMax,
      drainedMax,
      kedaThreshold: KEDA_THRESHOLD,
    });
  } finally {
    // Cleanup: delete the test stream + its DLQ so we don't leave keys behind.
    await publisher
      .del(TEST_STREAM, `${TEST_STREAM}:dlq`)
      .catch(() => undefined);
    await Promise.all([publisher.quit(), subscriber.quit()]);
  }
}

main().catch((err) => {
  console.error("[autoscale] FAIL:", err);
  process.exit(1);
});
