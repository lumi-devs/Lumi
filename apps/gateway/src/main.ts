// Gateway service.
//
// Drops discord.js `Client` entirely: we open the WS via `@discordjs/ws`
// `WebSocketManager` directly and publish raw dispatch packets onto the bus.
// No Sapphire stores, no entity managers, no client-level caches — the gateway
// is a thin decode + publish loop, so a 100-shard gateway no longer holds a
// `Client` with its managers and ~25 KB/guild of bookkeeping.
//
// It still runs: planShards + clustered IDENTIFY throttle + Redis session store,
// INTERACTION_DEFER_AT_GATEWAY (REST pre-ack), the drain sequence and readiness
// probes for rolling deploys, and REST telemetry.
import "./telemetry.js";
import { REST } from "@discordjs/rest";
import {
  WebSocketManager,
  WebSocketShardEvents,
  type SessionInfo,
} from "@discordjs/ws";
import {
  GatewayIntentBits,
  GatewayOpcodes,
  Routes,
  InteractionResponseType,
  type GatewayDispatchPayload,
} from "discord-api-types/v10";
import {
  createEventBus,
  attachProxyPublisher,
  type OwnedEventBus,
} from "@lumi/event-bus";
import { rawGatewayStream, type RawGatewayEnvelope } from "@lumi/contracts";
import {
  injectTraceContext,
  streamLength,
  streamConsumerLag,
  streamDlqLength,
  rest429Total,
  restRetryAfterSeconds,
  restInvalidRequestWarnings,
  registerReadinessProbe,
  runDrainSequence,
} from "@lumi/observability";
import {
  planShards,
  buildSimpleThrottlerFactory,
  attachCluster,
  ClusterReadyTracker,
  DynamicShardingStrategy,
  type ClusterBootstrap,
} from "@lumi/sharding";
import { Redis } from "ioredis";

const env = (k: string, def?: string): string => {
  const v = process.env[k];
  if (v !== undefined) return v;
  if (def !== undefined) return def;
  throw new Error(`[Gateway] Missing env: ${k}`);
};
const envInt = (k: string, def: number) =>
  process.env[k] === undefined ? def : Number(process.env[k]);

let TOKEN: string;
let TRANSPORT: string;
try {
  TOKEN = env("BOT_TOKEN");
  TRANSPORT = env("TRANSPORT", "streams");
} catch (err: unknown) {
  console.error(
    `[Gateway] Fatal startup error: ${err instanceof Error ? err.message : String(err)}`,
  );
  process.exit(1);
}

if (TRANSPORT !== "streams" && TRANSPORT !== "nats") {
  console.error(
    `[Gateway] TRANSPORT=${TRANSPORT} — gateway service requires TRANSPORT=streams or TRANSPORT=nats. Exiting.`,
  );
  process.exit(1);
}
const DEFER_AT_GATEWAY = process.env["INTERACTION_DEFER_AT_GATEWAY"] === "true";
const MAXLEN = envInt("EVENT_STREAM_MAXLEN", 100_000);
const PROXY_URL =
  process.env["DISCORD_PROXY_URL"]?.trim().replace(/\/+$/, "") || null;

const log = (level: "info" | "warn" | "error", msg: string, meta?: object) => {
  const line = meta
    ? `[Gateway] ${msg} ${JSON.stringify(meta)}`
    : `[Gateway] ${msg}`;
  const fn = level === "error" ? "error" : level === "warn" ? "warn" : "log";
  console[fn](line);
};

// REST: shared between defer-at-gateway pre-acks and the WebSocketManager's
// own gateway/bot fetch. One token, one bucket budget, one set of metrics.
const rest = new REST({
  version: "10",
  ...(PROXY_URL && {
    api: `${PROXY_URL}/api`,
    globalRequestsPerSecond: Number.POSITIVE_INFINITY,
  }),
  invalidRequestWarningInterval: 500,
}).setToken(TOKEN);
if (PROXY_URL) log("info", "REST proxy enabled", { url: PROXY_URL });

// Pre-flight: ask Discord for shard count + IDENTIFY budget before we open
// any socket.
const shardPlan = await planShards({ token: TOKEN, log }).catch(
  (err: unknown): never => {
    log("error", "fatal: shard planning failed", {
      err: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  },
);

// Optional cluster coordinator (multi-replica gateway).
const CLUSTER_NAME = process.env["CLUSTER_NAME"]?.trim() || null;
const REPLICA_ID =
  process.env["LUMI_CONSUMER_ID"] ||
  process.env["HOSTNAME"] ||
  `gateway-${process.pid}`;

let cluster: ClusterBootstrap | null = null;
let clusterRedis: Redis | null = null;
let clusterSub: Redis | null = null;
if (CLUSTER_NAME) {
  const redisOpts = {
    host: env("REDIS_HOST", "localhost"),
    port: envInt("REDIS_PORT", 6379),
    password: env("REDIS_PASSWORD", ""),
    db: envInt("REDIS_CACHE_DB", 0),
    lazyConnect: true,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };
  clusterRedis = new Redis(redisOpts);
  clusterSub = new Redis(redisOpts);
  await clusterRedis.connect();
  await clusterSub.connect();
  cluster = await attachCluster({
    plan: shardPlan,
    redis: clusterRedis,
    subscriber: clusterSub,
    clusterName: CLUSTER_NAME,
    replicaId: REPLICA_ID,
    log,
    onRebalance: (delta) => {
      log("info", "shard assignment changed — applying in place", {
        added: delta.added,
        removed: delta.removed,
      });
      void applyRebalance(delta.added, delta.removed);
    },
  });
  log("info", "joined cluster", {
    cluster: CLUSTER_NAME,
    replicaId: REPLICA_ID,
    shards: cluster.shards,
  });
}

const assignedShards = cluster?.shards ?? shardPlan.shards ?? null;
// Mutable view of currently-owned shards, kept in sync with the strategy across
// rebalances so readiness probes + ready-tracker math reflect the live set.
const ownedShards = new Set<number>(
  Array.isArray(assignedShards)
    ? assignedShards
    : Array.from({ length: shardPlan.shardCount }, (_, i) => i),
);

// Bus connection (Redis Streams or NATS JetStream). Streams uses the redis
// opts; NATS reads NATS_URL out of env via createEventBus.
const ownedBus: OwnedEventBus = createEventBus({
  transport: TRANSPORT as "streams" | "nats",
  redis: {
    host: env("REDIS_HOST", "localhost"),
    port: envInt("REDIS_PORT", 6379),
    password: env("REDIS_PASSWORD", ""),
    db: envInt("REDIS_CACHE_DB", 0),
  },
  natsServers: process.env["NATS_URL"] ?? process.env["NATS_SERVERS"],
  natsUser: process.env["NATS_USER"],
  natsPass: process.env["NATS_PASSWORD"],
  defaultMaxLen: MAXLEN,
  onStats: (s) => {
    streamLength.set({ stream: s.stream }, s.length);
    streamConsumerLag.set({ stream: s.stream, group: s.group }, s.pending);
    streamDlqLength.set({ stream: s.stream }, s.dlqLength);
  },
  log,
});

// WebSocketManager: no Client wrapper. We own the WS directly.
let dynamicStrategy: DynamicShardingStrategy | null = null;
const manager = new WebSocketManager({
  token: TOKEN,
  rest,
  // Match the intents the workers need — anything we DON'T list here, Discord
  // doesn't send. Worker-side code can grep these to know what's available.
  intents:
    GatewayIntentBits.Guilds |
    GatewayIntentBits.GuildMembers |
    GatewayIntentBits.GuildMessages |
    GatewayIntentBits.GuildVoiceStates |
    GatewayIntentBits.MessageContent,
  shardCount: shardPlan.shardCount,
  ...(assignedShards && { shardIds: [...assignedShards] }),
  buildIdentifyThrottler: async () =>
    cluster?.throttlerFactory
      ? cluster.throttlerFactory()
      : buildSimpleThrottlerFactory(shardPlan)(),
  // Custom strategy: in-place add/remove on rebalance instead of restart.
  // Only enabled when clustered; the single-replica path doesn't need it and
  // the standard SimpleShardingStrategy stays the default.
  ...(cluster && {
    // `mgr` is typed against discord.js's nested @discordjs/ws copy, but the
    // top-level @discordjs/ws is what we actually run against — same code,
    // duplicate type identity. Structural cast through unknown silences the
    // duplicate-import diagnostic without smuggling any runtime change.
    buildStrategy: ((mgr: unknown) => {
      dynamicStrategy = new DynamicShardingStrategy(
        mgr as ConstructorParameters<typeof DynamicShardingStrategy>[0],
      );
      return dynamicStrategy;
    }) as never,
  }),
  ...(cluster && {
    retrieveSessionInfo: (shardId: number) =>
      cluster!.sessionStore.retrieve(shardId),
    updateSessionInfo: (shardId: number, info: SessionInfo | null) =>
      cluster!.sessionStore.update(shardId, info),
  }),
});

async function applyRebalance(
  added: readonly number[],
  removed: readonly number[],
): Promise<void> {
  // Pre-restart fallback: if the cluster path isn't on a dynamic strategy
  // (e.g. someone disabled CLUSTER_NAME mid-flight), fall back to draining.
  if (!dynamicStrategy) {
    log("warn", "no dynamic strategy — falling back to restart", {
      added,
      removed,
    });
    void shutdown("REBALANCE");
    return;
  }
  try {
    if (removed.length > 0) {
      for (const id of removed) {
        ownedShards.delete(id);
        shardReady.delete(id);
        expectedShards.delete(id);
      }
      await dynamicStrategy.removeShards(removed, { code: 1000 });
    }
    if (added.length > 0) {
      for (const id of added) {
        ownedShards.add(id);
        expectedShards.add(id);
      }
      await dynamicStrategy.addShards(added);
    }
    publishReady();
    log("info", "in-place rebalance applied", {
      owned: [...ownedShards].sort((a, b) => a - b),
    });
  } catch (err) {
    log("error", "in-place rebalance failed — falling back to restart", {
      err: String(err),
    });
    void shutdown("REBALANCE");
  }
}

interface InteractionPayload {
  id: string;
  token: string;
  type: number;
  guild_id?: string;
}

async function deferInteraction(d: InteractionPayload): Promise<void> {
  let responseType: InteractionResponseType | null = null;
  if (d.type === 2 || d.type === 5) {
    responseType = InteractionResponseType.DeferredChannelMessageWithSource;
  } else if (d.type === 3) {
    responseType = InteractionResponseType.DeferredMessageUpdate;
  } else {
    return;
  }
  try {
    await rest.post(Routes.interactionCallback(d.id, d.token), {
      body: { type: responseType },
      auth: false,
    });
  } catch (err) {
    log("warn", "defer-at-gateway failed", {
      interactionId: d.id,
      type: d.type,
      err: String(err),
    });
  }
}

// Bus publisher: hook the WebSocketManager's Dispatch event. When
// DEFER_AT_GATEWAY is on, INTERACTION_CREATE is handled by the separate
// interceptor below (defer then publish) so the proxy publisher ignores it.
const detachPublisher = attachProxyPublisher(
  ownedBus.bus,
  manager as unknown as {
    on(
      event: string,
      l: (p: GatewayDispatchPayload, shardId: number) => void,
    ): unknown;
    off(
      event: string,
      l: (p: GatewayDispatchPayload, shardId: number) => void,
    ): unknown;
  },
  {
    log,
    maxLen: MAXLEN,
    dispatchEvent: WebSocketShardEvents.Dispatch,
    ignoreDispatchTypes: DEFER_AT_GATEWAY
      ? new Set(["INTERACTION_CREATE"])
      : undefined,
  },
);

if (DEFER_AT_GATEWAY) {
  manager.on(
    WebSocketShardEvents.Dispatch,
    (data: GatewayDispatchPayload, shardId: number) => {
      if (data.t !== "INTERACTION_CREATE") return;
      const d = data.d as InteractionPayload;
      const envelope: RawGatewayEnvelope = {
        shardId,
        packet: {
          op: GatewayOpcodes.Dispatch,
          t: data.t,
          s: (data as { s?: number }).s ?? 0,
          d: data.d as RawGatewayEnvelope["packet"]["d"],
        },
        ts: Date.now(),
        guildId: d.guild_id,
        ...injectTraceContext(),
      };
      void deferInteraction(d).then(() =>
        ownedBus.bus
          .publish(rawGatewayStream("INTERACTION_CREATE"), envelope, {
            maxLen: MAXLEN,
          })
          .catch((err) =>
            log("error", "interaction publish failed", { err: String(err) }),
          ),
      );
    },
  );
  log("info", "INTERACTION_DEFER_AT_GATEWAY=true — gateway will pre-ack");
}

// REST telemetry — same surface the worker emits.
const restLabels = (info: { route: string; method: string; global: boolean }) =>
  ({
    route: info.route,
    method: info.method,
    global: String(info.global),
  }) as const;
rest.on("rateLimited", (info) => {
  rest429Total.inc(restLabels(info));
  restRetryAfterSeconds.observe(restLabels(info), info.timeToReset / 1000);
});
rest.on("invalidRequestWarning", () => {
  restInvalidRequestWarnings.inc();
});

// Track readiness: count shards reporting Ready/Resumed → mark gateway healthy
// once every owned shard has connected.
const shardReady = new Set<number>();
const expectedShards = new Set<number>(
  Array.isArray(assignedShards)
    ? assignedShards
    : Array.from({ length: shardPlan.shardCount }, (_, i) => i),
);
// Cluster ready tracker: workers gate raw-gateway consumption on this flag
// so they don't process events while shards are mid-IDENTIFY.
const readyTracker =
  CLUSTER_NAME && clusterRedis
    ? new ClusterReadyTracker({
        redis: clusterRedis,
        clusterName: CLUSTER_NAME,
      })
    : null;
let readyHeartbeat: ReturnType<typeof setInterval> | null = null;
// Latches true the first time every owned shard has connected. See publishReady.
let everReady = false;
const publishReady = () => {
  if (!readyTracker) return;
  const allReady =
    expectedShards.size > 0 && shardReady.size === expectedShards.size;
  if (allReady) everReady = true;
  // Require every shard for the *initial* cluster-ready, but afterwards tolerate
  // a single shard transiently reconnecting (Closed→Resumed) so a per-shard blip
  // can't pause raw-event consumption fleet-wide (workers gate on this flag).
  // Only a total outage (no shards up) or gateway death (heartbeat TTL lapses)
  // flips the cluster back to not-ready.
  const clusterReady = everReady && shardReady.size > 0;
  readyTracker.publishReady(clusterReady).catch((err) =>
    log("warn", "publishReady failed", {
      ready: clusterReady,
      err: String(err),
    }),
  );
};
manager.on(WebSocketShardEvents.Ready, (_data, shardId: number) => {
  shardReady.add(shardId);
  log("info", `shard ${shardId} READY`);
  publishReady();
});
manager.on(WebSocketShardEvents.Resumed, (shardId: number) => {
  shardReady.add(shardId);
  log("info", `shard ${shardId} RESUMED`);
  publishReady();
});
manager.on(WebSocketShardEvents.Closed, (code: number, shardId: number) => {
  shardReady.delete(shardId);
  log("warn", `shard ${shardId} closed`, { code });
  publishReady();
});
manager.on(WebSocketShardEvents.Error, (error: Error, shardId: number) => {
  log("error", `shard ${shardId} error`, { err: String(error) });
});
if (readyTracker) {
  // Refresh the TTL while we remain ready, so a crashed gateway flips the
  // flag back to not-ready within ~30s without any cleanup logic.
  readyHeartbeat = setInterval(publishReady, 10_000);
}

registerReadinessProbe("discord-ws", () => {
  const ready = shardReady.size;
  const expected = expectedShards.size;
  return ready === expected
    ? { status: "ok" }
    : { status: "fail", detail: `${ready}/${expected} shards ready` };
});
registerReadinessProbe("event-bus", async () => {
  if (!ownedBus.publisher) {
    // NATS transport: no Redis publisher to ping. We could ping NATS here,
    // but the bus is built lazily and a synchronous status is fine — if the
    // connection later drops, publish() will surface the error and dispatch
    // events will pile up in @discordjs/ws's emit queue (bounded by GC).
    return { status: "ok" };
  }
  try {
    const pong = await ownedBus.publisher.ping();
    return pong === "PONG"
      ? { status: "ok" }
      : { status: "fail", detail: `unexpected ping reply: ${pong}` };
  } catch (err) {
    return { status: "fail", detail: String(err) };
  }
});
if (cluster) {
  registerReadinessProbe("cluster-joined", () =>
    cluster!.shards && cluster!.shards.length > 0
      ? { status: "ok" }
      : { status: "fail", detail: "no shards assigned" },
  );
}

let shuttingDown = false;
async function shutdown(sig: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  log("info", `${sig} received — shutting down`);
  const isRebalance = sig === "REBALANCE";
  if (readyHeartbeat) {
    clearInterval(readyHeartbeat);
    readyHeartbeat = null;
  }
  await runDrainSequence(
    [
      {
        name: "ready-flag-clear",
        run: async () => {
          if (readyTracker) await readyTracker.publishReady(false);
        },
      },
      {
        name: "cluster-leave",
        run: async () => {
          if (cluster) await cluster.close();
        },
      },
      {
        name: "publisher-detach",
        run: () => Promise.resolve(detachPublisher()),
      },
      {
        name: "ws-destroy",
        run: async () => {
          await manager.destroy({ code: 1000 });
        },
      },
      { name: "event-bus-close", run: () => ownedBus.close() },
      {
        name: "cluster-redis-quit",
        run: async () => {
          if (clusterRedis) await clusterRedis.quit().catch(() => undefined);
          if (clusterSub) await clusterSub.quit().catch(() => undefined);
        },
      },
    ],
    { log, preCloseGraceMs: isRebalance ? 0 : 5_000, deadlineMs: 30_000 },
  );
  process.exit(0);
}
["SIGINT", "SIGTERM"].forEach((sig) =>
  process.once(sig, () => void shutdown(sig)),
);

try {
  await manager.connect();
  log("info", "WS connected; publishing raw gateway events", {
    shards: [...expectedShards],
    transport: TRANSPORT,
  });
} catch (err) {
  log("error", "fatal connect failure", { err: String(err) });
  await ownedBus.close().catch(() => undefined);
  process.exit(1);
}
