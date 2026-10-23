import { Redis, type RedisOptions } from "ioredis";
import type { Logger } from "@lumi/foundation";
import { redisCommandDuration } from "@lumi/observability";

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
  };

  const client = new Redis(options.url, settings);
  client.on("error", (error) => options.logger.error({ error, role }, "redis error"));
  client.on("reconnecting", () => options.logger.warn({ role }, "redis reconnecting"));
  client.on("ready", () => options.logger.debug({ role }, "redis ready"));

  const send = client.sendCommand.bind(client);
  client.sendCommand = (command) => {
    const start = performance.now();
    const result = send(command);
    command.promise.then(
      () => redisCommandDuration.observe({ command: command.name, role }, (performance.now() - start) / 1_000),
      () => redisCommandDuration.observe({ command: command.name, role }, (performance.now() - start) / 1_000),
    );
    return result;
  };

  return client;
}
