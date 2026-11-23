import { logger } from "@lumi/foundation";
import { InvalidationBus } from "@lumi/redis";
import Redis from "ioredis";
import { serverConfig } from "./env.js";

const globalForRedis = globalThis as typeof globalThis & {
  __lumiDashboardRedis?: Redis;
};

const globalForInvalidation = globalThis as typeof globalThis & {
  __lumiDashboardInvalidation?: InvalidationBus;
};

export function getRedis(): Redis {
  if (globalForRedis.__lumiDashboardRedis) {
    return globalForRedis.__lumiDashboardRedis;
  }

  const config = serverConfig();
  const options = {
    lazyConnect: true,
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
  } as const;

  const redis = config.redisUrl
    ? new Redis(config.redisUrl, options)
    : new Redis({
        ...options,
        host: config.redisHost,
        port: config.redisPort,
        db: config.redisDb,
        ...(config.redisPassword ? { password: config.redisPassword } : {}),
      });

  redis.on("error", (error: Error) => {
    logger.error("[dashboard] redis error", error.message);
  });

  globalForRedis.__lumiDashboardRedis = redis;
  return redis;
}

export function dashboardKey(...parts: Array<string | number>): string {
  return ["lumi", "dashboard", ...parts.map(String)].join(":");
}

export function getInvalidationBus(): InvalidationBus {
  if (globalForInvalidation.__lumiDashboardInvalidation) {
    return globalForInvalidation.__lumiDashboardInvalidation;
  }

  const bus = new InvalidationBus(getRedis());
  globalForInvalidation.__lumiDashboardInvalidation = bus;
  return bus;
}
