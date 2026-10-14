import { Counter, Gauge, Histogram, Registry } from "prom-client";

export const registry = new Registry();

export const commandsTotal = new Counter({
  name: "lumi_commands_total",
  help: "Total commands executed",
  labelNames: ["command", "type", "status"] as const,
  registers: [registry],
});

export const commandDuration = new Histogram({
  name: "lumi_command_duration_seconds",
  help: "Command execution duration in seconds",
  labelNames: ["command", "type"] as const,
  registers: [registry],
});

export const cacheHits = new Counter({
  name: "lumi_cache_hits_total",
  help: "Cache hits",
  labelNames: ["cache"] as const,
  registers: [registry],
});

export const cacheMisses = new Counter({
  name: "lumi_cache_misses_total",
  help: "Cache misses",
  labelNames: ["cache"] as const,
  registers: [registry],
});

export const pgPoolSize = new Gauge({
  name: "lumi_pg_pool_size",
  help: "Configured maximum connections in the pg connection pool",
  registers: [registry],
});

export const pgPoolUsed = new Gauge({
  name: "lumi_pg_pool_used",
  help: "Connections currently checked out of the pg pool",
  registers: [registry],
});

export const pgPoolWaiting = new Gauge({
  name: "lumi_pg_pool_waiting",
  help: "Requests queued waiting for an available pg connection",
  registers: [registry],
});

export const dbQueryDuration = new Histogram({
  name: "lumi_db_query_duration_seconds",
  help: "Database query duration in seconds",
  labelNames: ["model", "operation"] as const,
  registers: [registry],
});

export const dbSlowQueriesTotal = new Counter({
  name: "lumi_db_slow_queries_total",
  help: "Queries exceeding threshold",
  labelNames: ["model", "operation"] as const,
  registers: [registry],
});

export const semaphoreInFlight = new Gauge({
  name: "lumi_semaphore_in_flight",
  help: "Permits currently checked out",
  labelNames: ["semaphore"] as const,
  registers: [registry],
});

export const semaphoreQueued = new Gauge({
  name: "lumi_semaphore_queued",
  help: "Callers waiting for a permit",
  labelNames: ["semaphore"] as const,
  registers: [registry],
});

export const semaphoreRejectedTotal = new Counter({
  name: "lumi_semaphore_rejected_total",
  help: "Callers rejected because queue was full",
  labelNames: ["semaphore"] as const,
  registers: [registry],
});

export const shardLatency = new Gauge({
  name: "lumi_shard_latency_ms",
  help: "Shard ping latency in milliseconds",
  labelNames: ["shard"] as const,
  registers: [registry],
});

export const shardStatus = new Gauge({
  name: "lumi_shard_status",
  help: "Shard connection status (1=ready, 0=disconnected)",
  labelNames: ["shard"] as const,
  registers: [registry],
});

export const guildCount = new Gauge({
  name: "lumi_guilds_total",
  help: "Total guilds currently served by this instance",
  registers: [registry],
});

export const rest429Total = new Counter({
  name: "lumi_rest_rate_limited_total",
  help: "Discord REST 429 rate limit responses received",
  labelNames: ["route"] as const,
  registers: [registry],
});

export const restRetryAfterSeconds = new Histogram({
  name: "lumi_rest_retry_after_seconds",
  help: "Value of retry-after from Discord 429 responses in seconds",
  labelNames: ["route"] as const,
  registers: [registry],
});

export const restInvalidRequestWarnings = new Counter({
  name: "lumi_rest_invalid_request_warnings_total",
  help: "Invalid request warnings emitted by @discordjs/rest",
  registers: [registry],
});

export const dashboardEventPublishFailures = new Counter({
  name: "lumi_dashboard_event_publish_failures_total",
  help: "Failures pushing dashboard updates",
  registers: [registry],
});

export const streamLength = new Gauge({
  name: "lumi_stream_length",
  help: "Stream length",
  labelNames: ["stream"] as const,
  registers: [registry],
});

export const streamConsumerLag = new Gauge({
  name: "lumi_stream_consumer_lag",
  help: "Stream lag",
  labelNames: ["stream", "group"] as const,
  registers: [registry],
});

export const streamDlqLength = new Gauge({
  name: "lumi_stream_dlq_length",
  help: "DLQ length",
  labelNames: ["stream"] as const,
  registers: [registry],
});

export const failedJobsTotal = new Counter({
  name: "lumi_scheduled_jobs_failed_total",
  help: "Failed scheduled jobs",
  labelNames: ["task"] as const,
  registers: [registry],
});

export const scheduledJobsGauge = new Gauge({
  name: "lumi_scheduled_jobs",
  help: "Scheduled jobs count",
  labelNames: ["state"] as const,
  registers: [registry],
});

export const queueDepth = new Gauge({
  name: "lumi_queue_depth",
  help: "Queue depth",
  labelNames: ["queue"] as const,
  registers: [registry],
});

export const valkeyCommandDuration = new Histogram({
  name: "lumi_command_duration_legacy",
  help: "Legacy duration",
  labelNames: ["command"] as const,
  registers: [registry],
});

export function initMetrics(): void {}
export function startMetricsServer(_port = 9090): any { return null; }
