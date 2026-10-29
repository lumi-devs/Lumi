export {
  activeModules,
  cacheEvictions,
  cacheFillDuration,
  cacheHits,
  cacheInvalidations,
  cacheMisses,
  cacheNegativeHits,
  cacheStaleWrites,
  cacheWrites,
  commandsExecuted,
  dbQueriesTotal,
  dbQueryDuration,
  economyTransactions,
  guildsTotal,
  httpRequestDuration,
  httpRequests,
  shardsOnline,
  usersTotal,
  noopCacheMetrics,
  pgPoolSize,
  pgPoolUsed,
  pgPoolWaiting,
  prometheusCacheMetrics,
  redisCommandDuration,
  registry,
  type CacheMetrics,
} from "./metrics.js";
export { startMetricsServer, type MetricsServer } from "./server.js";

export interface HealthCheck {
  name: string;
  check: () => Promise<{ healthy: boolean; details?: unknown }>;
}

export class HealthMonitor {
  private checks: HealthCheck[] = [];

  register(check: HealthCheck): void {
    this.checks.push(check);
  }

  async runChecks(): Promise<{ healthy: boolean; results: Array<{ name: string; healthy: boolean; details?: unknown }> }> {
    const results = await Promise.all(
      this.checks.map(async (check) => {
        try {
          const result = await check.check();
          return { name: check.name, ...result };
        } catch (error) {
          return { name: check.name, healthy: false, details: String(error) };
        }
      })
    );

    const healthy = results.every((r) => r.healthy);
    return { healthy, results };
  }
}

export function createHealthMonitor(): HealthMonitor {
  return new HealthMonitor();
}