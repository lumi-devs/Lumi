#!/usr/bin/env bun
// Shared REST proxy load test.
//
// Verifies that with N simulated worker processes hammering Discord REST
// concurrently through the shared nirn-proxy, none of them observe a 429
// response — the proxy globally serialises buckets + the per-token global
// limit so individual worker counts can't compound into a CloudFlare ban.
//
// HOW IT WORKS
//   1. Spawn `WORKERS` parallel @discordjs/rest clients, all pointed at the
//      proxy (`DISCORD_PROXY_URL`), all sharing the same `BOT_TOKEN`.
//   2. Each fires `REQUESTS_PER_WORKER` GET /users/@me calls (the cheapest
//      authenticated endpoint — bucket: `/users/@me`, low cost).
//   3. Aggregate: total wall time, RPS achieved, 429 count, max retry-after.
//   4. Assert: 429-on-the-wire count == 0 (the proxy may have queued internally
//      while honoring buckets, but discord.js should never see a 429).
//
// REQUIREMENTS
//   - A real `BOT_TOKEN` (the proxy forwards it).
//   - nirn-proxy reachable at `DISCORD_PROXY_URL` (defaults to
//     http://127.0.0.1:18080 — the host-port-mapped scale-profile container).
//
// Usage:
//   docker compose --profile scale up -d nirn-proxy
//   BOT_TOKEN=... bun scripts/loadtest-rest.ts
//   WORKERS=20 REQUESTS_PER_WORKER=50 bun scripts/loadtest-rest.ts
//   DISCORD_PROXY_URL="" bun scripts/loadtest-rest.ts   # A/B: direct path

import { REST } from "@discordjs/rest";
import { Routes } from "discord-api-types/v10";

const TOKEN = process.env["BOT_TOKEN"];
if (!TOKEN) {
  console.error(
    "[loadtest-rest] BOT_TOKEN is required (the proxy forwards it verbatim).",
  );
  process.exit(2);
}
const PROXY_URL =
  process.env["DISCORD_PROXY_URL"]?.trim().replace(/\/+$/, "") ||
  "http://127.0.0.1:18080";
const USE_PROXY = process.env["DISCORD_PROXY_URL"] !== "";
const WORKERS = Number(process.env["WORKERS"] ?? 10);
const REQUESTS_PER_WORKER = Number(process.env["REQUESTS_PER_WORKER"] ?? 50);

interface WorkerStats {
  id: number;
  ok: number;
  errors: number;
  // discord.js' REST manager retries 429 internally before throwing; we count
  // the *event*, not the thrown error, because the proxy is supposed to
  // pre-empt them entirely (the count must be 0 with the proxy on).
  rateLimits: number;
  maxRetryAfterSec: number;
}

function buildClient(id: number): { rest: REST; stats: WorkerStats } {
  const stats: WorkerStats = {
    id,
    ok: 0,
    errors: 0,
    rateLimits: 0,
    maxRetryAfterSec: 0,
  };
  const restOpts: ConstructorParameters<typeof REST>[0] = { version: "10" };
  if (USE_PROXY) {
    restOpts.api = `${PROXY_URL}/api`;
    // Disable discord.js' local global throttle — let the proxy be the only
    // gate so we're actually exercising its limiter, not stacking two.
    restOpts.globalRequestsPerSecond = Number.POSITIVE_INFINITY;
  }
  const rest = new REST(restOpts).setToken(TOKEN!);
  rest.on("rateLimited", (info) => {
    stats.rateLimits++;
    const sec = info.timeToReset / 1000;
    if (sec > stats.maxRetryAfterSec) stats.maxRetryAfterSec = sec;
  });
  return { rest, stats };
}

async function runWorker(
  rest: REST,
  stats: WorkerStats,
  count: number,
): Promise<void> {
  for (let i = 0; i < count; i++) {
    try {
      await rest.get(Routes.user("@me"));
      stats.ok++;
    } catch (err) {
      stats.errors++;
      // Print first few errors per worker so failures are diagnosable.
      if (stats.errors <= 2) {
        console.warn(
          `[loadtest-rest] worker ${stats.id} request ${i} failed:`,
          (err as Error).message,
        );
      }
    }
  }
}

async function main(): Promise<void> {
  console.log(
    `[loadtest-rest] workers=${WORKERS} per-worker=${REQUESTS_PER_WORKER} ` +
      `total=${WORKERS * REQUESTS_PER_WORKER} ` +
      `proxy=${USE_PROXY ? PROXY_URL : "(direct to discord.com)"}`,
  );

  const clients = Array.from({ length: WORKERS }, (_, i) => buildClient(i));
  const start = Date.now();
  await Promise.all(
    clients.map(({ rest, stats }) =>
      runWorker(rest, stats, REQUESTS_PER_WORKER),
    ),
  );
  const elapsedMs = Date.now() - start;

  const totals = clients.reduce(
    (acc, { stats }) => {
      acc.ok += stats.ok;
      acc.errors += stats.errors;
      acc.rateLimits += stats.rateLimits;
      acc.maxRetryAfterSec = Math.max(acc.maxRetryAfterSec, stats.maxRetryAfterSec);
      return acc;
    },
    { ok: 0, errors: 0, rateLimits: 0, maxRetryAfterSec: 0 },
  );
  const totalReqs = WORKERS * REQUESTS_PER_WORKER;
  const rps = (totals.ok / (elapsedMs / 1000)).toFixed(2);

  console.log("");
  console.log(`[loadtest-rest] elapsed=${elapsedMs}ms  achieved=${rps} req/s`);
  console.log(
    `[loadtest-rest] ok=${totals.ok}/${totalReqs}  errors=${totals.errors}  ` +
      `rateLimits=${totals.rateLimits}  maxRetryAfter=${totals.maxRetryAfterSec.toFixed(2)}s`,
  );

  // Per-worker breakdown so it's obvious if one worker was starved.
  for (const { stats } of clients) {
    console.log(
      `[loadtest-rest]   worker ${stats.id.toString().padStart(2)}  ` +
        `ok=${stats.ok}/${REQUESTS_PER_WORKER}  err=${stats.errors}  429=${stats.rateLimits}`,
    );
  }

  // SLO assertions
  let failed = false;
  if (USE_PROXY && totals.rateLimits > 0) {
    console.error(
      `[loadtest-rest] FAIL: saw ${totals.rateLimits} 429s with the proxy enabled — ` +
        `the proxy should serialize buckets so discord.js never observes 429s.`,
    );
    failed = true;
  }
  if (totals.errors > 0) {
    console.error(`[loadtest-rest] FAIL: ${totals.errors} request errors.`);
    failed = true;
  }
  if (failed) process.exit(1);
  console.log("[loadtest-rest] PASS");
}

await main();
