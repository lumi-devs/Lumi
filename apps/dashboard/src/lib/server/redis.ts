import { logger } from "@lumi/foundation";
import { InvalidationBus } from "@lumi/redis";
import Redis from "ioredis";
import { serverConfig } from "./env.js";

let redisInstance: Redis | null = null;
let busInstance: InvalidationBus | null = null;

export function getRedis(): Redis {
  if (redisInstance) {
    return redisInstance;
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

  redisInstance = redis;
  return redis;
}

export function dashboardKey(...parts: Array<string | number>): string {
  return ["lumi", "dashboard", ...parts.map(String)].join(":");
}

export function getInvalidationBus(): InvalidationBus {
  if (busInstance) {
    return busInstance;
  }

  const bus = new InvalidationBus(getRedis());
  busInstance = bus;
  return bus;
}
