import { container } from "@sapphire/framework";
import {
  RedisKeys,
  RedisTTL,
  redisConnectionOptions,
  parseRedisConnectionOption,
  createRedisClient as createInfraRedisClient,
  instrumentRedisLatency as infraInstrumentRedisLatency,
  InvalidationBus as InfraInvalidationBus,
  SignalBus as InfraSignalBus,
  type ResyncContext,
} from "@lumi/infrastructure/cache";
import type { RedisClient } from "@lumi/infrastructure/database";
import type { RedisOptions } from "ioredis";
import { redisCommandDuration } from "@lumi/observability";

export {
  RedisKeys,
  RedisTTL,
  redisConnectionOptions,
  parseRedisConnectionOption,
  type ResyncContext,
  type RedisOptions,
  type RedisClient,
};

export function instrumentRedisLatency(client: RedisClient): RedisClient {
  return infraInstrumentRedisLatency(client, (command, durationSeconds) => {
    redisCommandDuration.observe({ command }, durationSeconds);
  });
}

export function createRedisClient(): RedisClient {
  const logger = typeof container !== "undefined" && container.logger ? container.logger : undefined;
  return createInfraRedisClient({
    logger,
    onDuration: (command, durationSeconds) => {
      redisCommandDuration.observe({ command }, durationSeconds);
    },
  });
}

export class InvalidationBus extends InfraInvalidationBus {
  public constructor(subscriber: RedisClient, publisher?: RedisClient) {
    const logger = typeof container !== "undefined" && container.logger ? container.logger : undefined;
    const pub = publisher ?? (typeof container !== "undefined" && container.redis ? container.redis : undefined);
    super(subscriber, pub, logger);
  }

  public override async invalidate(...keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    if (typeof container !== "undefined" && container.redis) {
      this.setPublisher(container.redis);
    }
    return super.invalidate(...keys);
  }
}

export class SignalBus extends InfraSignalBus {
  public constructor(subscriber: RedisClient, publisher?: RedisClient) {
    const logger = typeof container !== "undefined" && container.logger ? container.logger : undefined;
    const pub = publisher ?? (typeof container !== "undefined" && container.redis ? container.redis : undefined);
    super(subscriber, pub, logger);
  }

  public override async publish(
    topic: string,
    payload: Record<string, string | number>,
  ): Promise<void> {
    if (typeof container !== "undefined" && container.redis) {
      this.setPublisher(container.redis);
    }
    return super.publish(topic, payload);
  }
}
