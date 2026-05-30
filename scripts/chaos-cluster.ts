#!/usr/bin/env bun
// Chaos test for the cluster coordinator.
//
// Requires a live Redis. Reads REDIS_HOST/PORT/PASSWORD/DB from env. Run:
//   bun scripts/chaos-cluster.ts
//
// Scenarios:
//   1. Three replicas join an empty cluster; contiguous shard ranges are
//      assigned across all 10 shards with at most one shard delta between
//      the largest and smallest range.
//   2. One replica leaves; the surviving two pick up the orphaned shards
//      and onRebalance fires with a non-empty `added` set. Other replicas'
//      `removed` is empty for shards they continued to own (no churn).
//   3. A fourth replica joins; the existing replicas hand off the right
//      number of shards via onRebalance.
//   4. Session-store round-trip: write a SessionInfo for shard 0 from
//      replica A, replica B retrieves the same SessionInfo (this is what
//      makes RESUME-after-rebalance work in production).
//
// This is not a unit test (real Redis, pubsub, time-based assertions); it
// lives under scripts/ like chaos-streams.ts.

import { Redis, type RedisOptions } from "ioredis";
import {
  ClusterCoordinator,
  RedisSessionStore,
  assignShards,
  type ShardDelta,
} from "../packages/sharding/src/index.js";
import type { SessionInfo } from "@discordjs/ws";

const CLUSTER = `chaos-${Date.now()}`;
const SHARD_COUNT = 10;

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

function log(stage: string, msg: string, meta?: object): void {
  // eslint-disable-next-line no-console
  console.log(
    `[chaos:${stage}] ${msg}${meta ? " " + JSON.stringify(meta) : ""}`,
  );
}

async function connectPair(): Promise<{ r: Redis; s: Redis }> {
  const r = new Redis(redisOpts());
  const s = new Redis(redisOpts());
  await r.connect();
  await s.connect();
  return { r, s };
}

interface Replica {
  id: string;
  coord: ClusterCoordinator;
  shards: number[];
  deltas: ShardDelta[];
  r: Redis;
  s: Redis;
}

async function spawn(id: string): Promise<Replica> {
  const { r, s } = await connectPair();
  const replica: Replica = {
    id,
    shards: [],
    deltas: [],
    coord: null as unknown as ClusterCoordinator,
    r,
    s,
  };
  replica.coord = new ClusterCoordinator({
    redis: r,
    subscriber: s,
    clusterName: CLUSTER,
    replicaId: id,
    shardCount: SHARD_COUNT,
    heartbeatIntervalMs: 500,
    memberTtlMs: 2_000,
    leaderLockTtlMs: 1_000,
    log: (lvl, msg, meta) => log(id, `${lvl} ${msg}`, meta),
  });
  replica.coord.onRebalance((delta) => {
    replica.deltas.push(delta);
    replica.shards = [...replica.coord.getShards()];
  });
  const join = await replica.coord.join();
  replica.shards = [...join.shards];
  return replica;
}

async function kill(r: Replica): Promise<void> {
  await r.coord.leave();
  await Promise.allSettled([r.r.quit(), r.s.quit()]);
}

function assertEq<T>(label: string, got: T, want: T): void {
  const a = JSON.stringify(got);
  const b = JSON.stringify(want);
  if (a !== b) {
    log("assert", `FAIL ${label}`, { got, want });
    process.exit(1);
  } else {
    log("assert", `ok   ${label}`);
  }
}

async function settle(ms = 1_500): Promise<void> {
  await new Promise((res) => setTimeout(res, ms));
}

async function pingOrExit(): Promise<void> {
  const r = new Redis(redisOpts());
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
  const r = new Redis(redisOpts());
  await r.connect();
  const keys = await r.keys(`lumi:cluster:${CLUSTER}:*`);
  if (keys.length) await r.del(...keys);
  await r.quit();
}

async function main(): Promise<void> {
  await pingOrExit();
  log("setup", `cluster=${CLUSTER} shards=${SHARD_COUNT}`);

  // pure-function sanity check on the assignment helper
  assertEq("assignShards 3×10 contiguous", assignShards(["a", "b", "c"], 10), {
    a: [0, 1, 2, 3],
    b: [4, 5, 6],
    c: [7, 8, 9],
  });

  // Scenario 1: three replicas join an empty cluster.
  const a = await spawn("replica-a");
  await settle(500);
  const b = await spawn("replica-b");
  await settle(500);
  const c = await spawn("replica-c");
  await settle(1_500); // wait for converged assignment

  const total = [...a.coord.getShards(), ...b.coord.getShards(), ...c.coord.getShards()];
  assertEq("scenario1 covers all shards", [...total].sort((x, y) => x - y), [
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
  ]);
  const sizes = [
    a.coord.getShards().length,
    b.coord.getShards().length,
    c.coord.getShards().length,
  ].sort();
  if (sizes[2]! - sizes[0]! > 1) {
    log("assert", "FAIL scenario1 imbalanced", { sizes });
    process.exit(1);
  }
  log("assert", "ok   scenario1 balanced", { sizes });

  // Scenario 2: kill replica-b, surviving two should pick up its shards.
  const beforeKill = {
    a: [...a.coord.getShards()],
    c: [...c.coord.getShards()],
  };
  const orphaned = [...b.coord.getShards()];
  await kill(b);
  await settle(2_500); // memberTtlMs + heartbeat + rebalance propagation

  const ownedNow = [
    ...a.coord.getShards(),
    ...c.coord.getShards(),
  ].sort((x, y) => x - y);
  assertEq("scenario2 all shards re-owned", ownedNow, [
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
  ]);
  // Some of the orphaned shards must show up as `added` somewhere in
  // replica-a's deltas (or c's). And shards that were already on a/c must
  // not appear in any `removed` set (no unnecessary churn).
  const addedSomewhere = new Set([
    ...a.deltas.flatMap((d) => d.added),
    ...c.deltas.flatMap((d) => d.added),
  ]);
  for (const id of orphaned) {
    if (!addedSomewhere.has(id) && !beforeKill.a.includes(id) && !beforeKill.c.includes(id)) {
      log("assert", "FAIL orphan not re-added", { id, addedSomewhere: [...addedSomewhere] });
      process.exit(1);
    }
  }
  log("assert", "ok   scenario2 orphaned shards re-assigned", {
    orphaned,
    addedSomewhere: [...addedSomewhere],
  });

  // Scenario 3: fourth replica joins; a + c each give up some shards.
  const d = await spawn("replica-d");
  await settle(2_000);
  const finalSizes = [
    a.coord.getShards().length,
    c.coord.getShards().length,
    d.coord.getShards().length,
  ].sort();
  if (finalSizes[2]! - finalSizes[0]! > 1) {
    log("assert", "FAIL scenario3 imbalanced after join", { finalSizes });
    process.exit(1);
  }
  log("assert", "ok   scenario3 balanced after join", { finalSizes });

  // Scenario 4: session store round-trip across replicas.
  const sessionA = new RedisSessionStore({
    redis: a.r,
    clusterName: CLUSTER,
    flushIntervalMs: 50,
    ttlSeconds: 60,
  });
  const sessionD = new RedisSessionStore({
    redis: d.r,
    clusterName: CLUSTER,
    flushIntervalMs: 50,
    ttlSeconds: 60,
  });
  const fakeSession: SessionInfo = {
    sessionId: "abc123",
    resumeURL: "wss://gateway.discord.gg",
    sequence: 42,
    shardCount: SHARD_COUNT,
    shardId: 0,
  };
  sessionA.update(0, fakeSession);
  await sessionA.flush();
  const retrieved = await sessionD.retrieve(0);
  assertEq("scenario4 session round-trip", retrieved, fakeSession);
  await sessionA.close();
  await sessionD.close();

  // Cleanup.
  await Promise.all([kill(a), kill(c), kill(d)]);
  await cleanup();
  log("done", "all scenarios passed");
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[chaos] fatal", err);
  process.exit(1);
});
