import Redis from "ioredis";
import { serverConfig } from "./env";

const globalForRedis = globalThis as typeof globalThis & {
  __lumiDashboardRedis?: Redis;
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
    console.error("[dashboard] redis error", error.message);
  });

  globalForRedis.__lumiDashboardRedis = redis;
  return redis;
}

export function dashboardKey(...parts: Array<string | number>): string {
  return ["lumi", "dashboard", ...parts.map(String)].join(":");
}
