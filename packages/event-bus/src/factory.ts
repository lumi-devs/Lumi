// Read TRANSPORT from env, build the right bus, and (for streams) own the
// dedicated ioredis connections it needs. `inproc` is the default so existing
// monolith deployments are unaffected until they opt in.
//
// We require TWO Redis connections for streams: ioredis serializes commands per
// connection, and XREADGROUP BLOCK holds the socket. Sharing one connection
// would stall publishes behind blocking reads.

import { Redis, type RedisOptions } from "ioredis";
import { InProcBus } from "./InProcBus.js";
import { RedisStreamsBus } from "./RedisStreamsBus.js";
import type { EventBus, TransportKind } from "./types.js";

export interface CreateEventBusOptions {
  /** Override env (mostly for tests). */
  transport?: TransportKind;
  /** Connection options for the streams transport. Required when transport=streams. */
  redis?: RedisOptions;
  /** Default per-stream MAXLEN cap. */
  defaultMaxLen?: number;
  log?: (level: "info" | "warn" | "error", msg: string, meta?: object) => void;
  /** See RedisStreamsBusOptions.maxDeliveries. Streams only. */
  maxDeliveries?: number;
  /** See RedisStreamsBusOptions.claimMinIdleMs. Streams only. */
  claimMinIdleMs?: number;
  /** See RedisStreamsBusOptions.claimIntervalMs. Streams only. */
  claimIntervalMs?: number;
  /** See RedisStreamsBusOptions.onStats. Streams only. */
  onStats?: (stats: import("./RedisStreamsBus.js").StreamStats) => void;
  /** See RedisStreamsBusOptions.statsIntervalMs. Streams only. */
  statsIntervalMs?: number;
}

export interface OwnedEventBus {
  bus: EventBus;
  transport: TransportKind;
  /** Caller invokes on shutdown to close both the bus and any owned connections. */
  close: () => Promise<void>;
}

export function createEventBus(
  opts: CreateEventBusOptions = {},
): OwnedEventBus {
  const transport: TransportKind =
    opts.transport ??
    (process.env.TRANSPORT as TransportKind | undefined) ??
    "inproc";

  if (transport === "inproc") {
    const bus = new InProcBus();
    return {
      bus,
      transport,
      close: () => bus.close(),
    };
  }

  if (!opts.redis) {
    throw new Error(
      "createEventBus({transport:'streams'}): `redis` options required",
    );
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
    transport,
    close: async () => {
      await bus.close();
      await Promise.allSettled([publisher.quit(), subscriber.quit()]);
    },
  };
}
