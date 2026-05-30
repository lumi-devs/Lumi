// Prometheus metrics. One registry per process, labelled with the service name.
// Apps scrape /metrics (startMetricsServer). RED metrics on command handling plus
// the scale-relevant signals: queue depth/lag, shard latency, REST 429s, cache hits.

import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  Registry,
} from "prom-client";
import { createServer, type Server } from "node:http";
import { runReadinessProbes } from "./readiness.js";

export const registry = new Registry();

let defaultsStarted = false;

export function initMetrics(service: string): void {
  registry.setDefaultLabels({ service });
  if (!defaultsStarted) {
    collectDefaultMetrics({ register: registry, prefix: "lumi_" });
    defaultsStarted = true;
  }
}

// ── RED: command handling ─────────────────────────────────────────────────────

export const commandsTotal = new Counter({
  name: "lumi_commands_total",
  help: "Commands handled, by command/type/status",
  labelNames: ["command", "type", "status"] as const,
  registers: [registry],
});

export const commandDuration = new Histogram({
  name: "lumi_command_duration_seconds",
  help: "Command handling latency in seconds",
  labelNames: ["command", "type"] as const,
  buckets: [0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [registry],
});

// ── Event bus / queue ─────────────────────────────────────────────────────────

export const busEventsPublished = new Counter({
  name: "lumi_bus_events_published_total",
  help: "Fanout events published to the bus, by event",
  labelNames: ["event"] as const,
  registers: [registry],
});

export const busEventsConsumed = new Counter({
  name: "lumi_bus_events_consumed_total",
  help: "Fanout events consumed from the bus, by event",
  labelNames: ["event"] as const,
  registers: [registry],
});

/** Depth/lag of a named queue (set from a collect callback or on enqueue/dequeue). */
export const queueDepth = new Gauge({
  name: "lumi_queue_depth",
  help: "Pending items in a named queue",
  labelNames: ["queue"] as const,
  registers: [registry],
});

// Redis Streams transport — fed by RedisStreamsBus.onStats (XLEN + XPENDING).

export const streamLength = new Gauge({
  name: "lumi_stream_length",
  help: "Length of a Redis stream (XLEN)",
  labelNames: ["stream"] as const,
  registers: [registry],
});

export const streamConsumerLag = new Gauge({
  name: "lumi_stream_consumer_lag",
  help: "Pending (delivered but unacked) entries in a consumer group",
  labelNames: ["stream", "group"] as const,
  registers: [registry],
});

export const streamDlqLength = new Gauge({
  name: "lumi_stream_dlq_length",
  help: "Length of the per-stream dead-letter queue",
  labelNames: ["stream"] as const,
  registers: [registry],
});

// ── Gateway / shard ───────────────────────────────────────────────────────────

export const shardLatency = new Gauge({
  name: "lumi_shard_latency_ms",
  help: "WebSocket heartbeat latency per shard (ms)",
  labelNames: ["shard"] as const,
  registers: [registry],
});

export const shardStatus = new Gauge({
  name: "lumi_shard_status",
  help: "Shard readiness (1 = ready, 0 = down)",
  labelNames: ["shard"] as const,
  registers: [registry],
});

export const guildCount = new Gauge({
  name: "lumi_guild_count",
  help: "Guilds currently cached by this process",
  registers: [registry],
});

// ── Discord REST ──────────────────────────────────────────────────────────────

export const rest429Total = new Counter({
  name: "lumi_rest_429_total",
  help: "Discord REST 429 (rate-limit) responses",
  labelNames: ["route", "method", "global"] as const,
  registers: [registry],
});

// Per-route retry-after distribution surfaced from discord.js' `rateLimited`
// event. Used to detect a single hot endpoint dominating the bucket budget
// (high p99 on a specific route is the smoking gun for needing per-route work).
export const restRetryAfterSeconds = new Histogram({
  name: "lumi_rest_retry_after_seconds",
  help: "Discord REST retry-after wait time when a rate limit fires",
  labelNames: ["route", "method", "global"] as const,
  // 50ms → 60s; nirn-proxy returns 429 with the bucket-resolved retry-after.
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60],
  registers: [registry],
});

// Invalid-request counter — each emit is N (configured warning interval)
// 401/403/429 responses in a rolling 10-minute window. Discord IP-bans the bot
// at 10k/10min; we set the interval to 500, so each tick = 500 invalid reqs.
// Alerts should fire well before the rate would project past 10k.
export const restInvalidRequestWarnings = new Counter({
  name: "lumi_rest_invalid_request_warnings_total",
  help: "discord.js invalidRequestWarning events (each = invalidRequestWarningInterval responses)",
  registers: [registry],
});

// ── Postgres pool ───────────────────────────────────────────────────────────

export const pgPoolSize = new Gauge({
  name: "lumi_pg_pool_size",
  help: "Configured max connections for the pg pool",
  registers: [registry],
});

export const pgPoolUsed = new Gauge({
  name: "lumi_pg_pool_used",
  help: "Checked-out (in-use) pg pool connections",
  registers: [registry],
});

export const pgPoolWaiting = new Gauge({
  name: "lumi_pg_pool_waiting",
  help: "Clients waiting for a pg pool connection",
  registers: [registry],
});

// ── Cache ─────────────────────────────────────────────────────────────────────

export const cacheHits = new Counter({
  name: "lumi_cache_hits_total",
  help: "Cache-aside hits, by cache",
  labelNames: ["cache"] as const,
  registers: [registry],
});

export const cacheMisses = new Counter({
  name: "lumi_cache_misses_total",
  help: "Cache-aside misses, by cache",
  labelNames: ["cache"] as const,
  registers: [registry],
});

/** Start a tiny /metrics HTTP server. No-op (returns null) if METRICS_ENABLED=false. */
export function startMetricsServer(port: number): Server | null {
  if (process.env["METRICS_ENABLED"] === "false") return null;

  const server = createServer((req, res) => {
    if (req.url === "/metrics") {
      registry
        .metrics()
        .then((body) => {
          res.writeHead(200, { "Content-Type": registry.contentType });
          res.end(body);
        })
        .catch(() => {
          res.writeHead(500);
          res.end();
        });
      return;
    }
    if (req.url === "/healthz") {
      // Liveness: process is up. No deep checks — k8s uses this to decide
      // whether to restart the container.
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end('{"status":"ok"}');
      return;
    }
    if (req.url === "/readyz") {
      // Readiness: gates traffic / shard assignment. 503 if any dependency
      // probe fails so the orchestrator pulls us out of rotation without a
      // restart.
      runReadinessProbes()
        .then((report) => {
          res.writeHead(report.ready ? 200 : 503, {
            "Content-Type": "application/json",
          });
          res.end(JSON.stringify(report));
        })
        .catch((err) => {
          res.writeHead(503, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ready: false, error: String(err) }));
        });
      return;
    }
    res.writeHead(404);
    res.end();
  });

  server.listen(port);
  return server;
}
