import { Redis, type RedisOptions } from "ioredis";
import type { Logger } from "@lumi/foundation";

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
  client.on("error", (error) => options.logger.error({ error, role }, "redis error"));
  client.on("reconnecting", () => options.logger.warn({ role }, "redis reconnecting"));
  client.on("ready", () => options.logger.debug({ role }, "redis ready"));

  return client;
}

/**
 * Pipeline multiple commands for batch execution.
 * Use for mget/mset/del batches to reduce round trips.
 */
export function createPipeline(redis: RedisClient): ReturnType<RedisClient["pipeline"]> {
  return redis.pipeline();
}