// Build the Redis Streams event bus and own the dedicated ioredis connections it needs.
//
// We require TWO Redis connections: ioredis serializes commands per
// connection, and XREADGROUP BLOCK holds the socket. Sharing one connection
// would stall publishes behind blocking reads.

import { Redis, type RedisOptions } from "ioredis";
import { RedisStreamsBus, type StreamStats } from "./RedisStreamsBus.js";
import type { EventBus } from "./types.js";

export interface CreateEventBusOptions {
  /** Connection options for Redis Streams. Required when creating an event bus. */
  redis?: RedisOptions;
  /** Default per-stream MAXLEN cap. */
  defaultMaxLen?: number;
  log?: (level: "info" | "warn" | "error", msg: string, meta?: object) => void;
  /** See RedisStreamsBusOptions.maxDeliveries. */
  maxDeliveries?: number;
  /** See RedisStreamsBusOptions.claimMinIdleMs. */
  claimMinIdleMs?: number;
  /** See RedisStreamsBusOptions.claimIntervalMs. */
  claimIntervalMs?: number;
  /** See RedisStreamsBusOptions.onStats. */
  onStats?: (stats: StreamStats) => void;
  /** See RedisStreamsBusOptions.statsIntervalMs. */
  statsIntervalMs?: number;
}

export interface OwnedEventBus {
  bus: EventBus;
  /**
   * Underlying publisher Redis client.
   * Exposed so readiness probes can PING the same connection the bus
   * publishes through without standing up a parallel client.
   */
  publisher: Redis;
  /** Caller invokes on shutdown to close both the bus and any owned connections. */
  close: () => Promise<void>;
}

export function createEventBus(
  opts: CreateEventBusOptions = {},
): OwnedEventBus {
  if (!opts.redis) {
    throw new Error("createEventBus(): `redis` options required");
  }

  const publisher = new Redis({ ...opts.redis, lazyConnect: true });
  const subscriber = new Redis({
    ...opts.redis,
    lazyConnect: true,
    // Blocking XREADGROUP commands must be tolerated by the retry layer.
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  const bus = new RedisStreamsBus({
    publisher,
    subscriber,
    defaultMaxLen: opts.defaultMaxLen,
    log: opts.log,
    maxDeliveries: opts.maxDeliveries,
    claimMinIdleMs: opts.claimMinIdleMs,
    claimIntervalMs: opts.claimIntervalMs,
    onStats: opts.onStats,
    statsIntervalMs: opts.statsIntervalMs,
  });

  return {
    bus,
    publisher,
    close: async () => {
      await bus.close();
      await Promise.allSettled([publisher.quit(), subscriber.quit()]);
    },
  };
}
