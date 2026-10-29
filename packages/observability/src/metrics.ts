import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from "prom-client";

export const registry = new Registry();

collectDefaultMetrics({ register: registry });

export const cacheHits = new Counter({
  name: "lumi_cache_hits_total",
  help: "Cache reads served from memory or Redis.",
  labelNames: ["cache"] as const,
  registers: [registry],
});

export const cacheMisses = new Counter({
  name: "lumi_cache_misses_total",
  help: "Cache reads that had to load from the source.",
  labelNames: ["cache"] as const,
  registers: [registry],
});

export const cacheNegativeHits = new Counter({
  name: "lumi_cache_negative_hits_total",
  help: "Cache reads that returned a cached null.",
  labelNames: ["cache"] as const,
  registers: [registry],
});

export const cacheWrites = new Counter({
  name: "lumi_cache_writes_total",
  help: "Values written to Redis.",
  labelNames: ["cache"] as const,
  registers: [registry],
});

export const cacheEvictions = new Counter({
  name: "lumi_cache_evictions_total",
  help: "Entries evicted from the in-process LRU.",
  labelNames: ["cache"] as const,
  registers: [registry],
});

export const cacheInvalidations = new Counter({
  name: "lumi_cache_invalidations_total",
  help: "Cache keys invalidated.",
  labelNames: ["cache"] as const,
  registers: [registry],
});

export const cacheFillDuration = new Histogram({
  name: "lumi_cache_fill_duration_seconds",
  help: "Time spent loading cache misses.",
  labelNames: ["cache"] as const,
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
  registers: [registry],
});

export const cacheStaleWrites = new Counter({
  name: "lumi_cache_stale_writes_total",
  help: "Loads discarded because the key was invalidated mid-flight.",
  labelNames: ["cache"] as const,
  registers: [registry],
});

export const dbQueryDuration = new Histogram({
  name: "lumi_db_query_duration_seconds",
  help: "Database query duration.",
  labelNames: ["model", "operation", "role"] as const,
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
  registers: [registry],
});

export const redisCommandDuration = new Histogram({
  name: "lumi_redis_command_duration_seconds",
  help: "Redis command duration.",
  labelNames: ["command", "role"] as const,
  buckets: [0.0005, 0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5],
  registers: [registry],
});

export const pgPoolSize = new Gauge({
  name: "lumi_pg_pool_size",
  help: "Configured Postgres pool size.",
  labelNames: ["role"] as const,
  registers: [registry],
});

export const pgPoolUsed = new Gauge({
  name: "lumi_pg_pool_used",
  help: "Postgres connections currently in use.",
  labelNames: ["role"] as const,
  registers: [registry],
});

export const pgPoolWaiting = new Gauge({
  name: "lumi_pg_pool_waiting",
  help: "Queries waiting for a Postgres connection.",
  labelNames: ["role"] as const,
  registers: [registry],
});

export const guildsTotal = new Gauge({
  name: "lumi_guilds_total",
  help: "Guilds the bot is currently a member of.",
  registers: [registry],
});

export const usersTotal = new Gauge({
  name: "lumi_users_total",
  help: "Cached users across all guilds.",
  registers: [registry],
});

export const shardsOnline = new Gauge({
  name: "lumi_shards_online",
  help: "Shards that have reported ready.",
  registers: [registry],
});

export const activeModules = new Gauge({
  name: "lumi_active_modules",
  help: "Modules successfully loaded by the module loader.",
  registers: [registry],
});

export const commandsExecuted = new Counter({
  name: "lumi_commands_executed_total",
  help: "Slash commands executed.",
  labelNames: ["command", "module", "status"] as const,
  registers: [registry],
});

export const economyTransactions = new Counter({
  name: "lumi_economy_transactions_total",
  help: "Economy transactions applied.",
  labelNames: ["type"] as const,
  registers: [registry],
});

export const httpRequests = new Counter({
  name: "lumi_http_requests_total",
  help: "HTTP requests handled by the internal RPC server.",
  labelNames: ["method", "route", "status"] as const,
  registers: [registry],
});

export const httpRequestDuration = new Histogram({
  name: "lumi_http_request_duration_seconds",
  help: "HTTP request duration for the internal RPC server.",
  labelNames: ["method", "route", "status"] as const,
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
  registers: [registry],
});

export const dbQueriesTotal = new Counter({
  name: "lumi_db_queries_total",
  help: "Database queries executed.",
  labelNames: ["model", "operation"] as const,
  registers: [registry],
});

// Mirrors the `CacheMetrics` contract in `@lumi/cache`; keep the two in sync.
export interface CacheMetrics {
  recordHit(namespace: string): void;
  recordMiss(namespace: string): void;
  recordNegativeHit(namespace: string): void;
  recordWrite(namespace: string): void;
  recordEviction(namespace: string): void;
  recordInvalidation(namespace: string): void;
  recordFillDuration(namespace: string, durationMs: number): void;
  recordStaleWrite(namespace: string): void;
}

export const prometheusCacheMetrics: CacheMetrics = {
  recordHit: (namespace) => void cacheHits.inc({ cache: namespace }),
  recordMiss: (namespace) => void cacheMisses.inc({ cache: namespace }),
  recordNegativeHit: (namespace) => void cacheNegativeHits.inc({ cache: namespace }),
  recordWrite: (namespace) => void cacheWrites.inc({ cache: namespace }),
  recordEviction: (namespace) => void cacheEvictions.inc({ cache: namespace }),
  recordInvalidation: (namespace) => void cacheInvalidations.inc({ cache: namespace }),
  recordFillDuration: (namespace, durationMs) =>
    cacheFillDuration.observe({ cache: namespace }, durationMs / 1000),
  recordStaleWrite: (namespace) => void cacheStaleWrites.inc({ cache: namespace }),
};

export const noopCacheMetrics: CacheMetrics = {
  recordHit: () => undefined,
  recordMiss: () => undefined,
  recordNegativeHit: () => undefined,
  recordWrite: () => undefined,
  recordEviction: () => undefined,
  recordInvalidation: () => undefined,
  recordFillDuration: () => undefined,
  recordStaleWrite: () => undefined,
};
