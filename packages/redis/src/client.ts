import { Redis, type RedisOptions } from "ioredis";

export interface Logger {
  info: (msg: string, meta?: any) => void;
  warn: (msg: string, meta?: any) => void;
  error: (msg: string, meta?: any) => void;
  debug: (msg: string, meta?: any) => void;
}

export type RedisClient = Redis;

export interface RedisClientOptions {
  url: string;
  role?: "cache" | "subscriber";
  logger: Logger;
}

export function createRedisClient(options: RedisClientOptions): RedisClient {
  const role = options.role ?? "cache";
  const settings: RedisOptions = {
    lazyConnect: true,
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    offlineQueue: false,
    commandTimeout: 5_000,
    retryStrategy: (attempt) => Math.min(100 * 2 ** attempt, 2_000),
    family: 4,
    connectTimeout: 10_000,
    enableOfflineQueue: false,
  };

  const client = new Redis(options.url, settings);
  client.on("error", (error) => options.logger.error(`redis error: ${error.message}`, { error, role }));
  client.on("reconnecting", () => options.logger.warn("redis reconnecting", { role }));
  client.on("ready", () => options.logger.debug("redis ready", { role }));

  return client;
}

export function createPipeline(redis: RedisClient): ReturnType<RedisClient["pipeline"]> {
  return redis.pipeline();
}