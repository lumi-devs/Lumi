import {
  Counter,
  collectDefaultMetrics,
  Histogram,
  Registry,
} from "prom-client";

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
  recordNegativeHit: (namespace) =>
    void cacheNegativeHits.inc({ cache: namespace }),
  recordWrite: (namespace) => void cacheWrites.inc({ cache: namespace }),
  recordEviction: (namespace) => void cacheEvictions.inc({ cache: namespace }),
  recordInvalidation: (namespace) =>
    void cacheInvalidations.inc({ cache: namespace }),
  recordFillDuration: (namespace, durationMs) =>
    cacheFillDuration.observe({ cache: namespace }, durationMs / 1000),
  recordStaleWrite: (namespace) =>
    void cacheStaleWrites.inc({ cache: namespace }),
};
