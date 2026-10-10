// Build the Valkey Streams event bus and own the dedicated iovalkey connections it needs.
//
// We require TWO Valkey connections: iovalkey serializes commands per
// connection, and XREADGROUP BLOCK holds the socket. Sharing one connection
// would stall publishes behind blocking reads.

import Valkey, { type RedisOptions } from "iovalkey";
import { StreamBus, type StreamStats } from "./stream-bus.js";
import type { EventBus } from "./types.js";

export type ValkeyOptions = RedisOptions;

export interface CreateEventBusOptions {
  /** Connection options for Valkey Streams. Required when creating an event bus. */
  valkey?: ValkeyOptions;
  /** Default per-stream MAXLEN cap. */
  defaultMaxLen?: number;
  log?: (level: "info" | "warn" | "error", msg: string, meta?: object) => void;
  /** See StreamBusOptions.maxDeliveries. */
  maxDeliveries?: number;
  /** See StreamBusOptions.claimMinIdleMs. */
  claimMinIdleMs?: number;
  /** See StreamBusOptions.claimIntervalMs. */
  claimIntervalMs?: number;
  /** See StreamBusOptions.onStats. */
  onStats?: (stats: StreamStats) => void;
  /** See StreamBusOptions.statsIntervalMs. */
  statsIntervalMs?: number;
}

export interface OwnedEventBus {
  bus: EventBus;
  /**
   * Underlying publisher Valkey client.
   * Exposed so readiness probes can PING the same connection the bus
   * publishes through without standing up a parallel client.
   */
  publisher: Valkey;
  /** Caller invokes on shutdown to close both the bus and any owned connections. */
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
    // Blocking XREADGROUP commands must be tolerated by the retry layer.
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
