

import Valkey, { type RedisOptions } from "iovalkey";
import { StreamBus, type StreamStats } from "#src/lib/event-bus/StreamBus.js";
import type { EventBus } from "#src/lib/event-bus/Types.js";

export type ValkeyOptions = RedisOptions;

export interface CreateEventBusOptions {

  valkey?: ValkeyOptions;

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

  publisher: Valkey;

  close: () => Promise<void>;
}

export function createEventBus(
  opts: CreateEventBusOptions = {},
): OwnedEventBus {
  const connectionOpts = opts.valkey;
  if (!connectionOpts) {
    throw new Error("createEventBus(): `valkey` options required");
  }

  const publisher = new Valkey({ ...connectionOpts, lazyConnect: true });
  const subscriber = new Valkey({
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
