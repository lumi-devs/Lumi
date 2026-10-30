export {
  activeModules,
  type CacheMetrics,
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
  noopCacheMetrics,
  pgPoolSize,
  pgPoolUsed,
  pgPoolWaiting,
  prometheusCacheMetrics,
  redisCommandDuration,
  registry,
  shardsOnline,
  usersTotal,
} from "./metrics.js";
export { type MetricsServer, startMetricsServer } from "./server.js";

export interface HealthCheckOutcome {
  readonly healthy: boolean;
  readonly details?: unknown;
}

export interface HealthCheck {
  readonly name: string;
  readonly check: () => Promise<HealthCheckOutcome>;
}

export interface HealthCheckResult extends HealthCheckOutcome {
  readonly name: string;
}

export interface HealthReport {
  readonly healthy: boolean;
  readonly results: readonly HealthCheckResult[];
}

export class HealthMonitor {
  private readonly checks: HealthCheck[] = [];

  register(check: HealthCheck): void {
    this.checks.push(check);
  }

  async runChecks(): Promise<HealthReport> {
    const results = await Promise.all(
      this.checks.map(async (check): Promise<HealthCheckResult> => {
        try {
          const result = await check.check();
          return { name: check.name, ...result };
        } catch (error) {
          return { name: check.name, healthy: false, details: String(error) };
        }
      }),
    );

    const healthy = results.every((result) => result.healthy);
    return { healthy, results };
  }
}

export function createHealthMonitor(): HealthMonitor {
  return new HealthMonitor();
}
