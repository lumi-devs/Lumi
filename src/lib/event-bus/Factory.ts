

import Redis, { type RedisOptions } from "ioredis";
import { StreamBus, type StreamStats } from "@event-bus/StreamBus.js";
import type { EventBus } from "@event-bus/Types.js";



export interface CreateEventBusOptions {

  redis?: RedisOptions;

  defaultMaxLen?: number;
  log?: (level: "info" | "warn" | "error", msg: string, meta?: object) => void;

  maxDeliveries?: number;

  claimMinIdleMs?: number;

  claimIntervalMs?: number;

  onStats?: (stats: StreamStats) => void;

  statsIntervalMs?: number;
}

export interface OwnedEventBus {
  bus: EventBus;

  publisher: Redis;

  close: () => Promise<void>;
}

export function createEventBus(
  opts: CreateEventBusOptions = {},
): OwnedEventBus {
  const connectionOpts = opts.redis;
  if (!connectionOpts) {
    throw new Error("createEventBus(): `redis` options required");
  }

  const publisher = new Redis({ ...connectionOpts, lazyConnect: true });
  const subscriber = new Redis({
    ...connectionOpts,
    lazyConnect: true,

    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  const bus = new StreamBus({
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
