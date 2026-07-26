// Read TRANSPORT from env, build the right bus, and (for streams) own the
// dedicated ioredis connections it needs. `inproc` is the default so existing
// monolith deployments are unaffected until they opt in.
//
// We require TWO Redis connections for streams: ioredis serializes commands per
// connection, and XREADGROUP BLOCK holds the socket. Sharing one connection
// would stall publishes behind blocking reads.

import { Redis, type RedisOptions } from "ioredis";
import { InProcBus } from "./InProcBus.js";
import { RedisStreamsBus, type StreamStats } from "./RedisStreamsBus.js";
import { NatsJetStreamBus } from "./NatsJetStreamBus.js";
import type { EventBus, TransportKind } from "./types.js";

export interface CreateEventBusOptions {
  /** Override env (mostly for tests). */
  transport?: TransportKind;
  /** Connection options for the streams transport. Required when transport=streams. */
  redis?: RedisOptions;
  /**
   * NATS server URL(s). Required when transport=nats. Comma-separated lets the
   * client failover between nodes in a cluster.
   */
  natsServers?: string | string[];
  /** Optional NATS user/pass. Token auth or NKey deferred to env-side setup. */
  natsUser?: string;
  natsPass?: string;
  /** Default per-stream MAXLEN cap. */
  defaultMaxLen?: number;
  log?: (level: "info" | "warn" | "error", msg: string, meta?: object) => void;
  /** See RedisStreamsBusOptions.maxDeliveries. Streams/NATS only. */
  maxDeliveries?: number;
  /** See RedisStreamsBusOptions.claimMinIdleMs. Streams only (NATS uses ackWaitMs). */
  claimMinIdleMs?: number;
  /** Mapped to NATS ackWait when transport=nats; defaults to claimMinIdleMs. */
  ackWaitMs?: number;
  /** See RedisStreamsBusOptions.claimIntervalMs. Streams only. */
  claimIntervalMs?: number;
  /** See RedisStreamsBusOptions.onStats. Streams/NATS. */
  onStats?: (stats: StreamStats) => void;
  /** See RedisStreamsBusOptions.statsIntervalMs. Streams/NATS. */
  statsIntervalMs?: number;
  /** See NatsJetStreamBusOptions.streamSubjects. NATS only. */
  streamSubjects?: string[];
}

export interface OwnedEventBus {
  bus: EventBus;
  transport: TransportKind;
  /**
   * Underlying publisher Redis client when transport is "streams"; null on
   * inproc. Exposed so readiness probes can PING the same connection the bus
   * publishes through without standing up a parallel client.
   */
  publisher: Redis | null;
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
      publisher: null,
      close: () => bus.close(),
    };
  }

  if (transport === "nats") {
    const servers =
      opts.natsServers ??
      process.env["NATS_URL"] ??
      process.env["NATS_SERVERS"];
    if (!servers) {
      throw new Error(
        "createEventBus({transport:'nats'}): `natsServers` (or NATS_URL) required",
      );
    }
    // Import lazily — nats is only a dep when this transport is actually used,
    // and lazy import keeps inproc/streams users out of the import graph.

    return buildNatsBus(opts, servers);
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
    publisher,
    close: async () => {
      await bus.close();
      await Promise.allSettled([publisher.quit(), subscriber.quit()]);
    },
  };
}

function buildNatsBus(
  opts: CreateEventBusOptions,
  servers: string | string[],
): OwnedEventBus {
  // Synchronously return an OwnedEventBus whose bus methods await connection.
  // We build a thin proxy that defers until `ready` resolves so callers don't
  // need to know the transport is async to construct.
  let nc: import("nats").NatsConnection | null = null;
  const ready: Promise<NatsJetStreamBus> = (async () => {
    const { connect } = await import("nats");
    nc = await connect({
      servers: Array.isArray(servers)
        ? servers
        : servers.split(",").map((s) => s.trim()),
      user: opts.natsUser,
      pass: opts.natsPass,
      reconnect: true,
      maxReconnectAttempts: -1,
      name: process.env["LUMI_CONSUMER_ID"] ?? "lumi-bus",
    });
    return new NatsJetStreamBus({
      connection: nc,
      defaultMaxLen: opts.defaultMaxLen,
      log: opts.log,
      maxDeliveries: opts.maxDeliveries,
      ackWaitMs: opts.ackWaitMs ?? opts.claimMinIdleMs,
      onStats: opts.onStats,
      statsIntervalMs: opts.statsIntervalMs,
      streamSubjects: opts.streamSubjects,
    });
  })();
  ready.catch((err) =>
    opts.log?.("error", "NATS connect failed", { err: String(err) }),
  );

  const bus: EventBus = {
    publish: async (stream, body, pubOpts) => {
      const b = await ready;
      return b.publish(stream, body, pubOpts);
    },
    consume: async (streams, consumeOpts, handler) => {
      const b = await ready;
      return b.consume(streams, consumeOpts, handler);
    },
    close: async () => (await ready).close(),
  };

  return {
    bus,
    transport: "nats",
    publisher: null,
    close: async () => {
      await bus.close();
      if (nc) {
        await nc.drain().catch(() => undefined);
        await nc.close().catch(() => undefined);
      }
    },
  };
}
