// Gateway service — Part II S2 slice 2.
//
// Sole responsibilities:
//   1. Maintain Discord WS (sharded) and feed events through the event bus.
//   2. (Optional, path-a) Pre-ack INTERACTION_CREATE via REST within Discord's
//      3s deadline so worker followups always succeed regardless of bus latency.
//
// Explicitly NOT here: Sapphire stores, modules, Prisma, RabbitMQ, repositories.
// Workers consume from the bus and run all business logic.
import "./telemetry.js";
import {
  Client,
  GatewayIntentBits,
  Partials,
  Options,
  type ClientOptions,
} from "discord.js";
import { REST } from "@discordjs/rest";
import { Routes, InteractionResponseType } from "discord-api-types/v10";
import {
  createEventBus,
  RawGatewayPublisher,
  type OwnedEventBus,
} from "@ember/event-bus";
import { rawGatewayStream, type RawGatewayEnvelope } from "@ember/contracts";
import {
  injectTraceContext,
  streamLength,
  streamConsumerLag,
  streamDlqLength,
  rest429Total,
  restRetryAfterSeconds,
  restInvalidRequestWarnings,
} from "@ember/observability";
import {
  planShards,
  buildSimpleThrottlerFactory,
  attachCluster,
  type ClusterBootstrap,
} from "@ember/sharding";
import { Redis } from "ioredis";
import type { SessionInfo } from "@discordjs/ws";

const env = (k: string, def?: string): string => {
  const v = process.env[k];
  if (v !== undefined) return v;
  if (def !== undefined) return def;
  throw new Error(`[Gateway] Missing env: ${k}`);
};
const envInt = (k: string, def: number) =>
  process.env[k] !== undefined ? Number(process.env[k]) : def;

const TOKEN = env("BOT_TOKEN");
const TRANSPORT = env("TRANSPORT", "streams");
if (TRANSPORT !== "streams") {
  // Gateway-as-its-own-process only makes sense when the bus is real; otherwise
  // the monolith path (apps/worker) is the right entrypoint.
  console.error(
    `[Gateway] TRANSPORT=${TRANSPORT} — gateway service requires TRANSPORT=streams. Exiting.`,
  );
  process.exit(1);
}
const DEFER_AT_GATEWAY = process.env["INTERACTION_DEFER_AT_GATEWAY"] === "true";
const MAXLEN = envInt("EVENT_STREAM_MAXLEN", 100_000);
// S4: optional shared REST proxy (nirn-proxy) base URL. Empty/unset → talk to
// discord.com directly. Declared up here because both `clientOptions.rest`
// (constructed below) and the standalone `new REST()` for defer-at-gateway
// need it.
const PROXY_URL =
  process.env["DISCORD_PROXY_URL"]?.trim().replace(/\/+$/, "") || null;

const log = (level: "info" | "warn" | "error", msg: string, meta?: object) => {
  const line = meta
    ? `[Gateway] ${msg} ${JSON.stringify(meta)}`
    : `[Gateway] ${msg}`;
  const fn = level === "error" ? "error" : level === "warn" ? "warn" : "log";
  console[fn](line);
};

// S3 slice 1: ask Discord for the recommended shard count + session-start
// budget *before* opening the WS so we (a) log it, (b) bail on exhausted
// IDENTIFY budget instead of burning it on a restart loop, (c) feed the real
// max_concurrency to the IdentifyThrottler.
const shardPlan = await planShards({ token: TOKEN, log });

// S3 slice 2/3: if CLUSTER_NAME is set, join the cluster coordinator and use
// the shared session store + Redis-backed IDENTIFY throttler. Otherwise we
// remain on the single-replica path (SHARD_LIST from the plan, in-process
// SimpleIdentifyThrottler, sessions not persisted across restarts).
const CLUSTER_NAME = process.env["CLUSTER_NAME"]?.trim() || null;
const REPLICA_ID =
  process.env["EMBER_CONSUMER_ID"] ||
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
      // In-place mid-flight reshard is not safe with @discordjs/ws's cached
      // shardIds, so we drain instead. The next process boot will read the
      // assignment, RESUME sessions still in the 5-minute window, and
      // IDENTIFY only the truly new ones — bucketed via the Redis throttler.
      log("warn", "shard assignment changed — draining for restart", {
        added: delta.added,
        removed: delta.removed,
      });
      void shutdown("REBALANCE");
    },
  });
  log("info", "joined cluster", {
    cluster: CLUSTER_NAME,
    replicaId: REPLICA_ID,
    shards: cluster.shards,
  });
}

// ClientOptions is augmented by @sapphire/plugin-scheduled-tasks (pulled in
// transitively via workspace deps) which requires `tasks`. The gateway never
// loads sapphire, so the field is dead weight here.
const clientOptions = {
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel, Partials.GuildMember],
  makeCache: Options.cacheWithLimits({
    ...Options.DefaultMakeCacheSettings,
    MessageManager: 0,
    PresenceManager: 0,
    ReactionManager: 0,
    GuildMemberManager: 0,
    ThreadManager: 0,
    UserManager: 1,
    StageInstanceManager: 0,
    VoiceStateManager: 0,
    GuildScheduledEventManager: 0,
    AutoModerationRuleManager: 0,
    GuildBanManager: 0,
    GuildInviteManager: 0,
    GuildEmojiManager: 0,
    GuildStickerManager: 0,
    BaseGuildEmojiManager: 0,
    ApplicationCommandManager: 0,
    ApplicationEmojiManager: 0,
  }),
  shardCount: shardPlan.shardCount,
  ...((cluster?.shards ?? shardPlan.shards) && {
    shards: [...(cluster?.shards ?? shardPlan.shards!)],
  }),
  ws: {
    buildIdentifyThrottler:
      cluster?.throttlerFactory ?? buildSimpleThrottlerFactory(shardPlan),
    ...(cluster && {
      retrieveSessionInfo: (shardId: number) =>
        cluster!.sessionStore.retrieve(shardId),
      updateSessionInfo: (shardId: number, info: SessionInfo | null) =>
        cluster!.sessionStore.update(shardId, info),
    }),
  },
  // S4: route the gateway client's internal REST (used by `/gateway/bot`
  // probes, REST-based shard ops, etc.) through the proxy too.
  rest: {
    ...(PROXY_URL && {
      api: `${PROXY_URL}/api`,
      globalRequestsPerSecond: Number.POSITIVE_INFINITY,
    }),
    invalidRequestWarningInterval: 500,
  },
} satisfies Partial<ClientOptions>;
const client = new Client(clientOptions as unknown as ClientOptions);

const ownedBus: OwnedEventBus = createEventBus({
  transport: "streams",
  redis: {
    host: env("REDIS_HOST", "localhost"),
    port: envInt("REDIS_PORT", 6379),
    password: env("REDIS_PASSWORD", ""),
    db: envInt("REDIS_CACHE_DB", 0),
  },
  defaultMaxLen: MAXLEN,
  // Gateway is publish-only; consume-side stats fire on the worker. But XLEN
  // and DLQ length are publish-side observable, so report them from here too
  // (only fires if a consume() is wired up, which gateway does not — left in
  // place so a future gateway-side bus consumer picks it up for free).
  onStats: (s) => {
    streamLength.set({ stream: s.stream }, s.length);
    streamConsumerLag.set({ stream: s.stream, group: s.group }, s.pending);
    streamDlqLength.set({ stream: s.stream }, s.dlqLength);
  },
  log,
});

// S4: standalone REST instance for defer-at-gateway. Shares the same proxy
// config as `clientOptions.rest` above so the gateway speaks through the same
// bucket state as the workers.
const rest = new REST({
  version: "10",
  ...(PROXY_URL && {
    api: `${PROXY_URL}/api`,
    // Proxy is authoritative; local 50/s throttle is dead weight (and would
    // serialise gateway's own pre-acks against worker traffic invisibly).
    globalRequestsPerSecond: Number.POSITIVE_INFINITY,
  }),
  invalidRequestWarningInterval: 500,
}).setToken(TOKEN);
if (PROXY_URL) log("info", "REST proxy enabled", { url: PROXY_URL });

interface InteractionPayload {
  id: string;
  token: string;
  type: number;
}

async function deferInteraction(d: InteractionPayload): Promise<void> {
  // type: 2 = APPLICATION_COMMAND, 3 = MESSAGE_COMPONENT, 4 = AUTOCOMPLETE,
  //       5 = MODAL_SUBMIT. Type 4 cannot be deferred (must return choices).
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

const publisher = new RawGatewayPublisher(
  ownedBus.bus,
  client as unknown as {
    ws: {
      handlePacket: (packet: unknown, shard: { id: number }) => boolean;
    };
  },
  {
    log,
    maxLen: MAXLEN,
    // INTERACTION_CREATE is handled by our own interceptor below when
    // DEFER_AT_GATEWAY is on (defer-then-publish in series).
    ignoreDispatchTypes: DEFER_AT_GATEWAY
      ? new Set(["INTERACTION_CREATE"])
      : undefined,
  },
);
publisher.attach();

if (DEFER_AT_GATEWAY) {
  const ws = client.ws as unknown as {
    handlePacket: (packet: unknown, shard: { id: number }) => boolean;
  };
  const orig = ws.handlePacket.bind(ws);
  ws.handlePacket = (packet: unknown, shard: { id: number }) => {
    const p = packet as
      | {
          op?: number;
          t?: string;
          d?: InteractionPayload & { guild_id?: string };
        }
      | undefined;
    if (p?.op === 0 && p.t === "INTERACTION_CREATE" && p.d) {
      const envelope: RawGatewayEnvelope = {
        shardId: shard.id,
        packet: p as RawGatewayEnvelope["packet"],
        ts: Date.now(),
        guildId: p.d.guild_id,
        ...injectTraceContext(),
      };
      void deferInteraction(p.d).then(() =>
        ownedBus.bus
          .publish(rawGatewayStream("INTERACTION_CREATE"), envelope, {
            maxLen: MAXLEN,
          })
          .catch((err) =>
            log("error", "interaction publish failed", { err: String(err) }),
          ),
      );
      return true;
    }
    return orig(packet, shard);
  };
  log("info", "INTERACTION_DEFER_AT_GATEWAY=true — gateway will pre-ack");
}

// S4: surface the same REST telemetry the worker emits (rate-limit hits,
// retry-after distribution, invalid-request warnings) from the gateway's
// internal REST client too — gateway shares the per-token bucket budget so
// the metrics need to add up across services.
const restLabels = (info: { route: string; method: string; global: boolean }) =>
  ({
    route: info.route,
    method: info.method,
    global: String(info.global),
  }) as const;
client.rest.on("rateLimited", (info) => {
  rest429Total.inc(restLabels(info));
  restRetryAfterSeconds.observe(restLabels(info), info.timeToReset / 1000);
});
client.rest.on("invalidRequestWarning", () => {
  restInvalidRequestWarnings.inc();
});
// Same listeners on the standalone REST used by defer-at-gateway.
rest.on("rateLimited", (info) => {
  rest429Total.inc(restLabels(info));
  restRetryAfterSeconds.observe(restLabels(info), info.timeToReset / 1000);
});
rest.on("invalidRequestWarning", () => {
  restInvalidRequestWarnings.inc();
});

client.on("ready", () => {
  log("info", `Gateway online as ${client.user?.tag ?? "<unknown>"}`);
});
client.on("shardError", (err, id) =>
  log("error", `shard ${id} error`, { err: String(err) }),
);
client.on("error", (err) => log("error", "client error", { err: String(err) }));

let shuttingDown = false;
async function shutdown(sig: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  log("info", `${sig} received — shutting down`);
  try {
    publisher.detach();
    await client.destroy();
    await ownedBus.close();
    if (cluster) await cluster.close();
    if (clusterRedis) await clusterRedis.quit().catch(() => undefined);
    if (clusterSub) await clusterSub.quit().catch(() => undefined);
  } catch (err) {
    log("error", "shutdown failure", { err: String(err) });
  }
  process.exit(0);
}
["SIGINT", "SIGTERM"].forEach((sig) =>
  process.once(sig, () => void shutdown(sig)),
);

try {
  await client.login(TOKEN);
  log("info", "WS connected; publishing raw gateway events");
} catch (err) {
  log("error", "fatal login failure", { err: String(err) });
  await ownedBus.close().catch(() => undefined);
  process.exit(1);
}
