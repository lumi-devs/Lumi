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
} from "discord-api-types/v10";
import {
  createEventBus,
  attachProxyPublisher,
  type OwnedEventBus,
} from "@lumi/event-bus";
import { rawGatewayStream, type RawGatewayEnvelope } from "@lumi/contracts";
import {
  createPinoLogger,
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
import {
  envParseString,
  envParseInteger,
  isInteractionDeferAtGateway,
  getClusterName,
  getConsumerId,
  getDiscordProxyUrl,
} from "#lib/env.js";

const TOKEN = envParseString("BOT_TOKEN");
const TRANSPORT = envParseString("TRANSPORT", "streams");

if (TRANSPORT !== "streams") {
  console.error(
    `[Gateway] TRANSPORT=${TRANSPORT} — gateway service requires TRANSPORT=streams. Exiting.`,
  );
  process.exit(1);
}
const DEFER_AT_GATEWAY = isInteractionDeferAtGateway();
const MAXLEN = envParseInteger("EVENT_STREAM_MAXLEN", 100_000);
const PROXY_URL = getDiscordProxyUrl();

const pino = createPinoLogger({
  service: "gateway",
  level: process.env["NODE_ENV"] === "development" ? "debug" : "info",
  format: process.env["NODE_ENV"] === "development" ? "pretty" : "json",
});

const log = (level: "info" | "warn" | "error", msg: string, meta?: object) => {
  if (meta) pino[level](meta, msg);
  else pino[level](msg);
};

const rest = new REST({
  version: "10",
  ...(PROXY_URL && {
    api: `${PROXY_URL}/api`,
    globalRequestsPerSecond: Number.POSITIVE_INFINITY,
  }),
  invalidRequestWarningInterval: 500,
}).setToken(TOKEN);
if (PROXY_URL) log("info", "REST proxy enabled", { url: PROXY_URL });

const shardPlan = await planShards({ token: TOKEN, log }).catch(
  (err: unknown): never => {
    log("error", "fatal: shard planning failed", {
      err: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  },
);

const CLUSTER_NAME = getClusterName();
const REPLICA_ID = getConsumerId();

let cluster: ClusterBootstrap | null = null;
let clusterRedis: Redis | null = null;
let clusterSub: Redis | null = null;
if (CLUSTER_NAME) {
  const redisOpts = {
    host: envParseString("REDIS_HOST", "localhost"),
    port: envParseInteger("REDIS_PORT", 6379),
    password: envParseString("REDIS_PASSWORD", ""),
    db: envParseInteger("REDIS_CACHE_DB", 0),
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
const ownedShards = new Set<number>(
  Array.isArray(assignedShards)
    ? assignedShards
    : Array.from({ length: shardPlan.shardCount }, (_, i) => i),
);

const ownedBus: OwnedEventBus = createEventBus({
  transport: TRANSPORT,
  redis: {
    host: envParseString("REDIS_HOST", "localhost"),
    port: envParseInteger("REDIS_PORT", 6379),
    password: envParseString("REDIS_PASSWORD", ""),
    db: envParseInteger("REDIS_CACHE_DB", 0),
  },
  defaultMaxLen: MAXLEN,
  onStats: (s) => {
    streamLength.set({ stream: s.stream }, s.length);
    streamConsumerLag.set({ stream: s.stream, group: s.group }, s.pending);
    streamDlqLength.set({ stream: s.stream }, s.dlqLength);
  },
  log,
});

let dynamicStrategy: DynamicShardingStrategy | null = null;
const manager = new WebSocketManager({
  token: TOKEN,
  rest,
  intents:
    GatewayIntentBits.Guilds |
    GatewayIntentBits.GuildMembers |
    GatewayIntentBits.GuildMessages |
    GatewayIntentBits.GuildVoiceStates |
    GatewayIntentBits.MessageContent |
    GatewayIntentBits.GuildPresences,
  shardCount: shardPlan.shardCount,
  ...(assignedShards && { shardIds: [...assignedShards] }),
  buildIdentifyThrottler: async () =>
    cluster?.throttlerFactory
      ? cluster.throttlerFactory()
      : buildSimpleThrottlerFactory(shardPlan)(),
  ...(cluster && {
    buildStrategy: (mgr: unknown) => {
      dynamicStrategy = new DynamicShardingStrategy(
        mgr as ConstructorParameters<typeof DynamicShardingStrategy>[0],
      );
      return dynamicStrategy;
    },
  }),
  ...(cluster && {
    retrieveSessionInfo: (shardId: number) =>
      cluster.sessionStore.retrieve(shardId),
    updateSessionInfo: (shardId: number, info: SessionInfo | null) =>
      cluster.sessionStore.update(shardId, info),
  }),
});

async function applyRebalance(
  added: readonly number[],
  removed: readonly number[],
): Promise<void> {
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

const detachPublisher = attachProxyPublisher(ownedBus.bus, manager, {
  log,
  maxLen: MAXLEN,
  dispatchEvent: WebSocketShardEvents.Dispatch,
  ignoreDispatchTypes: DEFER_AT_GATEWAY
    ? new Set(["INTERACTION_CREATE"])
    : undefined,
});

if (DEFER_AT_GATEWAY) {
  manager.on(
    WebSocketShardEvents.Dispatch,
    (data: any, shardId: number) => {
      if (data.t !== "INTERACTION_CREATE") return;
      const d = data.d as InteractionPayload;
      const envelope: RawGatewayEnvelope = {
        shardId,
        packet: {
          op: GatewayOpcodes.Dispatch,
          t: data.t,
          s: (data as { s?: number }).s ?? 0,
          d: data.d,
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

const shardReady = new Set<number>();
const expectedShards = new Set<number>(
  Array.isArray(assignedShards)
    ? assignedShards
    : Array.from({ length: shardPlan.shardCount }, (_, i) => i),
);
const readyTracker =
  CLUSTER_NAME && clusterRedis
    ? new ClusterReadyTracker({
        redis: clusterRedis,
        clusterName: CLUSTER_NAME,
      })
    : null;
let readyHeartbeat: ReturnType<typeof setInterval> | null = null;
let everReady = false;
const publishReady = () => {
  if (!readyTracker) return;
  const allReady =
    expectedShards.size > 0 && shardReady.size === expectedShards.size;
  if (allReady) everReady = true;
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
    cluster.shards && cluster.shards.length > 0
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
