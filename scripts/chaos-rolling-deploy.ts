#!/usr/bin/env bun
// S6 Slice 4 — synthetic-load rolling-deploy chaos test.
//
// Drives the same code paths a production rolling deploy hits, against a real
// Redis, without spinning up Discord:
//
//   1. Two "gateways" join a ClusterCoordinator over 10 shards. A producer
//      publishes synthetic raw-gateway events onto a Redis Stream, tagged with
//      the shardId of the gateway that owns the shard at publish time.
//   2. Two "workers" XREADGROUP-consume the stream via a shared consumer group
//      (RedisStreamsBus), acking each message.
//   3. Mid-load we drain gateway-A (coord.leave() — what Slice 2 wires SIGTERM
//      to). Gateway-B picks up A's shards; the producer follows ownership.
//      Asserts:
//        * zero dropped events between publish and ack (no rolling-deploy gap)
//        * gateway-B's onRebalance shows {added=A's old shards, removed=∅} —
//          no shard storm (every shard B kept stayed put)
//   4. Mid-load we kill worker-A by abandoning its consume loop without ack.
//      XAUTOCLAIM should redeliver to worker-B. Asserts: every published
//      event is acked exactly once-as-far-as-effect (deliveryCount may be >1
//      on the redelivered slice, that's fine).
//
// Requires a live Redis. Reads REDIS_HOST/PORT/PASSWORD/DB from env. Run with:
//   bun scripts/chaos-rolling-deploy.ts

import { Redis, type RedisOptions } from "ioredis";
import { ClusterCoordinator } from "../packages/sharding/src/index.js";
import { RedisStreamsBus } from "../packages/event-bus/src/RedisStreamsBus.js";

const RUN_ID = Date.now();
const CLUSTER = `chaos-roll-${RUN_ID}`;
const STREAM = `ember:chaos:roll:${RUN_ID}`;
const GROUP = "ember-chaos-roll";
const SHARD_COUNT = 10;
const PUBLISH_RATE_HZ = 200; // events/sec across all live shards
const CLAIM_MIN_IDLE_MS = 500;

function redisOpts(): RedisOptions {
  return {
    host: process.env["REDIS_HOST"] ?? "localhost",
    port: Number(process.env["REDIS_PORT"] ?? 6379),
    password: process.env["REDIS_PASSWORD"] || undefined,
    db: Number(process.env["REDIS_CACHE_DB"] ?? 0),
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
  };
}

function newRedis(): Redis {
  return new Redis(redisOpts());
}

function log(stage: string, msg: string, meta?: object): void {
  // eslint-disable-next-line no-console
  console.log(
    `[chaos:${stage}] ${msg}${meta ? " " + JSON.stringify(meta) : ""}`,
  );
}

let failed = false;
function assert(cond: boolean, label: string, meta?: object): void {
  if (cond) log("assert", `ok   ${label}`, meta);
  else {
    failed = true;
    log("assert", `FAIL ${label}`, meta);
  }
}

async function pingOrExit(): Promise<void> {
  const r = newRedis();
  try {
    await r.connect();
    await r.ping();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      `[chaos] Redis unreachable (${String(err)}). Set REDIS_HOST/PORT/PASSWORD and retry.`,
    );
    process.exit(2);
  } finally {
    await r.quit().catch(() => undefined);
  }
}

async function cleanup(): Promise<void> {
  const r = newRedis();
  await r.connect();
  const streamKeys = await r.keys(`${STREAM}*`);
  const clusterKeys = await r.keys(`ember:cluster:${CLUSTER}:*`);
  const all = [...streamKeys, ...clusterKeys];
  if (all.length) await r.del(...all);
  await r.quit();
}

interface Gateway {
  id: string;
  coord: ClusterCoordinator;
  shards: Set<number>;
  added: number[];
  removed: number[];
  r: Redis;
  s: Redis;
}

async function spawnGateway(id: string): Promise<Gateway> {
  const r = newRedis();
  const s = newRedis();
  await r.connect();
  await s.connect();
  const gw: Gateway = {
    id,
    shards: new Set(),
    added: [],
    removed: [],
    coord: null as unknown as ClusterCoordinator,
    r,
    s,
  };
  gw.coord = new ClusterCoordinator({
    redis: r,
    subscriber: s,
    clusterName: CLUSTER,
    replicaId: id,
    shardCount: SHARD_COUNT,
    heartbeatIntervalMs: 500,
    memberTtlMs: 2_000,
    leaderLockTtlMs: 1_000,
    log: () => undefined,
  });
  gw.coord.onRebalance((delta) => {
    gw.added.push(...delta.added);
    gw.removed.push(...delta.removed);
    gw.shards = new Set(gw.coord.getShards());
  });
  const join = await gw.coord.join();
  gw.shards = new Set(join.shards);
  return gw;
}

async function killGateway(gw: Gateway): Promise<void> {
  await gw.coord.leave();
  await Promise.allSettled([gw.r.quit(), gw.s.quit()]);
}

interface SynthEvent {
  seq: number;
  shardId: number;
}

interface Worker {
  id: string;
  bus: RedisStreamsBus;
  stop: (() => Promise<void>) | null;
  seen: Map<number, number>; // seq -> deliveryCount (last seen)
  pub: Redis;
  sub: Redis;
}

async function spawnWorker(id: string): Promise<Worker> {
  const pub = newRedis();
  const sub = newRedis();
  await pub.connect();
  await sub.connect();
  const bus = new RedisStreamsBus({
    publisher: pub,
    subscriber: sub,
    log: () => undefined,
    maxDeliveries: 10,
    claimMinIdleMs: CLAIM_MIN_IDLE_MS,
    claimIntervalMs: 250,
    statsIntervalMs: 0,
  });
  const w: Worker = { id, bus, stop: null, seen: new Map(), pub, sub };
  w.stop = await bus.consume<SynthEvent>(
    [STREAM],
    { group: GROUP, consumer: id, blockMs: 200, batchSize: 32 },
    async (msg) => {
      w.seen.set(msg.body.seq, msg.deliveryCount);
      await msg.ack();
    },
  );
  return w;
}

async function disposeWorker(w: Worker): Promise<void> {
  if (w.stop) await w.stop();
  await w.bus.close().catch(() => undefined);
  await Promise.allSettled([w.pub.quit(), w.sub.quit()]);
}

async function settle(ms: number): Promise<void> {
  await new Promise((res) => setTimeout(res, ms));
}

async function main(): Promise<void> {
  await pingOrExit();
  log("setup", `cluster=${CLUSTER} stream=${STREAM} shards=${SHARD_COUNT}`);

  // ── 1. Steady state: 2 gateways + 2 workers ───────────────────────────────
  const gwA = await spawnGateway("gw-a");
  await settle(300);
  const gwB = await spawnGateway("gw-b");
  await settle(1_500);
  const before = {
    a: new Set(gwA.coord.getShards()),
    b: new Set(gwB.coord.getShards()),
  };
  log("setup", "gateway shards", {
    a: [...before.a],
    b: [...before.b],
  });
  assert(
    [...before.a, ...before.b].length === SHARD_COUNT,
    "gateways cover all shards",
  );

  const wkA = await spawnWorker("wk-a");
  const wkB = await spawnWorker("wk-b");
  log("setup", "workers consuming", { group: GROUP });

  // Reset onRebalance accounting so we only measure post-steady-state deltas.
  gwA.added.length = 0;
  gwA.removed.length = 0;
  gwB.added.length = 0;
  gwB.removed.length = 0;

  // ── 2. Producer driven by current shard ownership ─────────────────────────
  let seq = 0;
  let producerStopped = false;
  const producerPub = newRedis();
  await producerPub.connect();
  const producerBus = new RedisStreamsBus({
    publisher: producerPub,
    subscriber: producerPub, // never used for reads in the producer
    log: () => undefined,
    claimIntervalMs: 0,
    statsIntervalMs: 0,
  });
  const intervalMs = 1_000 / PUBLISH_RATE_HZ;
  const producerLoop = (async () => {
    while (!producerStopped) {
      // For each live shard, find which gateway owns it now (real prod: the
      // gateway itself publishes; here we just consult coordinator state).
      const ownership: Record<number, Gateway> = {};
      for (const sid of gwA.coord.getShards()) ownership[sid] = gwA;
      for (const sid of gwB.coord.getShards()) ownership[sid] = gwB;
      for (let sid = 0; sid < SHARD_COUNT; sid++) {
        if (!ownership[sid]) continue; // unowned — would be dropped in prod too
        seq += 1;
        await producerBus.publish<SynthEvent>(STREAM, { seq, shardId: sid });
      }
      await settle(intervalMs);
    }
  })();

  // ── 3. Rolling deploy: drain gateway-A under load ─────────────────────────
  await settle(1_000);
  const aShardsBeforeDrain = [...before.a];
  log("drain", "draining gw-a", { shards: aShardsBeforeDrain });
  await killGateway(gwA);
  await settle(2_500); // memberTtlMs + heartbeat + rebalance propagation

  const bShardsAfter = new Set(gwB.coord.getShards());
  assert(
    bShardsAfter.size === SHARD_COUNT,
    "gw-b owns every shard after gw-a drain",
    { size: bShardsAfter.size },
  );
  // No shard storm: B never gave anything up — its `removed` is empty and its
  // `added` is exactly A's old shards.
  const bAdded = new Set(gwB.added);
  const expectedAdds = new Set(aShardsBeforeDrain);
  assert(
    gwB.removed.length === 0,
    "no shard storm: gw-b removed nothing",
    { removed: gwB.removed },
  );
  for (const sid of expectedAdds) {
    if (!bAdded.has(sid)) {
      assert(false, "gw-b picked up orphaned shard", { sid });
    }
  }
  log("drain", "rebalance delta", {
    bAdded: [...bAdded],
    bRemoved: gwB.removed,
  });

  // Keep load running for a bit, then stop the producer and let workers drain.
  await settle(2_000);
  producerStopped = true;
  await producerLoop;
  log("publish", "producer stopped", { totalPublished: seq });
  await settle(2_000); // wait for in-flight XREADGROUP batches to land

  // ── 4. Drop assertion ─────────────────────────────────────────────────────
  const allSeen = new Set<number>([
    ...wkA.seen.keys(),
    ...wkB.seen.keys(),
  ]);
  const missing: number[] = [];
  for (let s = 1; s <= seq; s++) if (!allSeen.has(s)) missing.push(s);
  assert(
    missing.length === 0,
    "zero dropped events across rolling drain",
    {
      published: seq,
      acked: allSeen.size,
      missingFirstFew: missing.slice(0, 5),
    },
  );

  // ── 5. Worker chaos: kill wk-a mid-load, XAUTOCLAIM should rescue ─────────
  log("worker-chaos", "starting second phase: kill wk-a mid-load");
  // Snapshot what wk-a saw, then break its bus (simulate hard crash without
  // ack — pending entries should be auto-claimed by wk-b after CLAIM_MIN_IDLE_MS).
  const wkBSeenBefore = new Set(wkB.seen.keys());

  // Restart producer for a short burst.
  producerStopped = false;
  const burstStart = seq + 1;
  const burst = (async () => {
    for (let i = 0; i < 200; i++) {
      seq += 1;
      await producerBus.publish<SynthEvent>(STREAM, {
        seq,
        shardId: i % SHARD_COUNT,
      });
      await settle(5);
    }
  })();

  // Kill wk-a mid-burst by quitting its connections without stopping the loop
  // cleanly. RedisStreamsBus will throw on the next XREADGROUP — we want the
  // pending list to stay populated, so we explicitly DON'T stop() it first.
  await settle(200);
  await Promise.allSettled([wkA.pub.quit(), wkA.sub.quit()]);
  log("worker-chaos", "wk-a connections killed (no clean stop)");

  await burst;
  producerStopped = true;
  log("worker-chaos", "burst complete", { burstStart, burstEnd: seq });

  // Give wk-b's XAUTOCLAIM loop time to sweep wk-a's pending entries.
  await settle(CLAIM_MIN_IDLE_MS + 2_000);

  // Count how many of the burst seqs landed on wk-b. The rest may legitimately
  // be in wk-a's seen map from before we killed it.
  const burstAcked = new Set<number>();
  for (let s = burstStart; s <= seq; s++) {
    if (wkA.seen.has(s) || wkB.seen.has(s)) burstAcked.add(s);
  }
  const burstMissing = seq - burstStart + 1 - burstAcked.size;
  assert(
    burstMissing === 0,
    "no events lost when wk-a crashed without acking",
    { burstSize: seq - burstStart + 1, acked: burstAcked.size },
  );

  // At least one event should have been redelivered (deliveryCount > 1) on
  // wk-b — that's the XAUTOCLAIM rescue path doing its job.
  const redelivered = [...wkB.seen.entries()]
    .filter(([s, n]) => s >= burstStart && n > 1)
    .map(([s]) => s);
  log("worker-chaos", "redelivered via XAUTOCLAIM", {
    count: redelivered.length,
    sample: redelivered.slice(0, 5),
    bSeenGain: wkB.seen.size - wkBSeenBefore.size,
  });
  // Soft assert: redelivered may be 0 if wk-a managed to ack everything before
  // its sockets closed. We just log it and require zero drops above.

  // ── Cleanup ───────────────────────────────────────────────────────────────
  await disposeWorker(wkB);
  await producerBus.close().catch(() => undefined);
  await producerPub.quit().catch(() => undefined);
  await killGateway(gwB);
  await cleanup();
  log("done", failed ? "FAILED" : "all scenarios passed");
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[chaos] fatal", err);
  process.exit(1);
});
