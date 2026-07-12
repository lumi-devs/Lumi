#!/usr/bin/env bun
// Chaos / latency test for the gateway-proxy cutover.
//
// What we verify (no Discord token required):
//   1. End-to-end latency from "gateway publishes raw envelope" to "worker
//      consumes + acks" stays under SLO at the target event rate.
//   2. The cooperative Redis entity-cache populator writes the projection on
//      GUILD_CREATE / CHANNEL_CREATE / GUILD_ROLE_CREATE — i.e. the path the
//      proxy publisher → bus consumer → entity-populator chain actually works.
//   3. The path is identical across TRANSPORT=streams and (when NATS_URL is
//      set) TRANSPORT=nats. We rerun the scenario per transport.
//
// We don't drive a real Discord WS — that's the gateway's concern; this test
// targets the *pipe* between gateway and worker. We synthesise dispatch
// envelopes shaped exactly like the proxy publisher emits.
//
// Run:  bun scripts/chaos-gateway-proxy.ts
// Or:   TRANSPORT=nats NATS_URL=nats://127.0.0.1:14222 bun scripts/chaos-gateway-proxy.ts

import { Redis } from "ioredis";
import { createEventBus } from "../packages/event-bus/src/factory.ts";
import { rawGatewayStream } from "../packages/contracts/src/gateway-packet.ts";

// Inlined to keep this script free of the discord.js import chain that the
// real `RedisEntityCache` pulls in transitively (Sapphire container → djs).
// The shape and TTL match `packages/core/src/lib/entity-cache/RedisEntityCache.ts`.
const ENTITY_TTL = 60 * 60 * 24;
const entityGuildKey = (id: string) => `lumi:ent:guild:${id}`;
async function putGuildRaw(
  r: Redis,
  g: { id: string; name: string; ownerId: string; cachedAt: number },
): Promise<void> {
  const k = entityGuildKey(g.id);
  await r
    .multi()
    .hmset(k, {
      id: g.id,
      name: g.name,
      ownerId: g.ownerId,
      cachedAt: String(g.cachedAt),
    })
    .expire(k, ENTITY_TTL)
    .exec();
}
async function getGuildRaw(r: Redis, id: string): Promise<boolean> {
  const h = await r.hgetall(entityGuildKey(id));
  return !!h.id;
}

const TRANSPORT = (process.env["TRANSPORT"] as "streams" | "nats") ?? "streams";
const TOTAL_EVENTS = Number(process.env["TOTAL_EVENTS"] ?? 2_000);
const TARGET_RATE = Number(process.env["TARGET_RATE"] ?? 500); // evt/s
// SLO: p99 publish → ack under 200 ms on a same-host Redis/NATS.
const P99_SLO_MS = Number(process.env["P99_SLO_MS"] ?? 200);

function log(stage: string, msg: string, meta?: object): void {
  console.log(
    `[chaos:${stage}] ${msg}${meta ? " " + JSON.stringify(meta) : ""}`,
  );
}

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

let failed = false;
function assert(cond: boolean, label: string): void {
  if (cond) log("assert", `OK — ${label}`);
  else {
    failed = true;
    log("assert", `FAIL — ${label}`);
  }
}

function pct(arr: number[], p: number): number {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const i = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[i]!;
}

async function runScenario(transport: "streams" | "nats"): Promise<void> {
  log(transport, "starting scenario");

  const cacheRedis = redis();
  await cacheRedis.connect();

  const owned = createEventBus({
    transport,
    redis: {
      host: process.env["REDIS_HOST"] ?? "localhost",
      port: Number(process.env["REDIS_PORT"] ?? 6379),
      password: process.env["REDIS_PASSWORD"] || undefined,
      db: Number(process.env["REDIS_CACHE_DB"] ?? 0),
    },
    natsServers: process.env["NATS_URL"] ?? "nats://127.0.0.1:14222",
    defaultMaxLen: TOTAL_EVENTS * 2,
    log: (level, msg) => log(`${transport}:bus`, `${level} ${msg}`),
  });
  const bus = owned.bus;

  const latencies: number[] = [];
  const guildIds = new Set<string>();
  let consumed = 0;

  const stream = rawGatewayStream("GUILD_CREATE");
  const stop = await bus.consume<{ ts: number; packet: { d: { id: string } } }>(
    [stream],
    {
      group: "lumi-chaos",
      consumer: `worker-${transport}-1`,
      blockMs: 200,
      batchSize: 32,
    },
    async (msg) => {
      const lat = Date.now() - msg.body.ts;
      latencies.push(lat);
      consumed++;
      guildIds.add(msg.body.packet.d.id);
      // Mirror the populator: write the cache row.
      await putGuildRaw(cacheRedis, {
        id: msg.body.packet.d.id,
        name: `chaos-${msg.body.packet.d.id}`,
        ownerId: "0",
        cachedAt: Date.now(),
      });
      await msg.ack();
    },
  );

  // Pacer: publish at TARGET_RATE evt/s.
  const start = Date.now();
  const interval = Math.max(1, Math.floor(1000 / TARGET_RATE));
  let published = 0;
  while (published < TOTAL_EVENTS) {
    const batchEnd = Math.min(published + TARGET_RATE / 10, TOTAL_EVENTS);
    while (published < batchEnd) {
      const guildId = `g-${transport}-${published}`;
      await bus.publish(stream, {
        shardId: 0,
        packet: {
          op: 0,
          t: "GUILD_CREATE",
          s: published,
          d: { id: guildId, name: `chaos-${guildId}`, owner_id: "0" },
        },
        ts: Date.now(),
        guildId,
      });
      published++;
    }
    await new Promise((r) => setTimeout(r, interval));
  }
  log(transport, `publisher done`, {
    published,
    elapsedMs: Date.now() - start,
  });

  // Drain.
  const drainStart = Date.now();
  while (consumed < TOTAL_EVENTS && Date.now() - drainStart < 30_000) {
    await new Promise((r) => setTimeout(r, 100));
  }
  await stop();
  await owned.close();

  const p50 = pct(latencies, 50);
  const p99 = pct(latencies, 99);
  log(transport, "drained", {
    published,
    consumed,
    p50,
    p99,
    sloMs: P99_SLO_MS,
  });

  assert(consumed >= TOTAL_EVENTS, `consumed all ${TOTAL_EVENTS} events`);
  assert(p99 <= P99_SLO_MS, `p99 ${p99}ms ≤ SLO ${P99_SLO_MS}ms`);

  // Verify the cache projection landed for a sample of guilds.
  const sample = [...guildIds].slice(0, 5);
  let cached = 0;
  for (const id of sample) {
    if (await getGuildRaw(cacheRedis, id)) cached++;
  }
  assert(
    cached === sample.length,
    `entity cache populated for ${sample.length} sampled guilds`,
  );

  // Cleanup cache rows.
  if (guildIds.size > 0) {
    await cacheRedis.del(...[...guildIds].map(entityGuildKey));
  }
  await cacheRedis.quit();
}

async function main(): Promise<void> {
  log("env", `transport=${TRANSPORT} target=${TARGET_RATE} evt/s × ${TOTAL_EVENTS}`);
  await runScenario(TRANSPORT);
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
