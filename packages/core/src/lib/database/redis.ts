import { container } from "@sapphire/framework";
import { tryParseJSON } from "@sapphire/utilities";
import { envIsDefined, envParseInteger, envParseString } from "#lib/env.js";
import { Redis, Cluster, type RedisOptions } from "ioredis";
import { delSafe, type RedisClient } from "#lib/database/cluster-safe.js";
import { logError } from "#lib/utilities/errors.js";

export const RedisKeys = {
  guildSettings: (guildId: string) => `lumi:settings:guild:${guildId}`,
  guildConfig: (module: string, guildId: string) =>
    `lumi:cfg:${module}:guild:${guildId}`,
  guildAllModuleConfigs: (guildId: string) =>
    `lumi:cfg:all:guild:${guildId}`,
  globalConfig: () => "lumi:cfg:global",
  guildPrefixes: (guildId: string) => `lumi:prefix:guild:${guildId}`,

  moduleEnabled: (module: string, guildId: string) =>
    `lumi:module:enabled:${module}:${guildId}`,
  moduleGlobalEnabled: (module: string) =>
    `lumi:module:global:enabled:${module}`,

  permOverrides: (commandPath: string, guildId: string) =>
    `lumi:perms:${commandPath}:${guildId}`,
  targetPermits: (
    guildId: string,
    targetType: "user" | "role" | "channel",
    targetId: string,
  ) => `lumi:permits:${guildId}:${targetType}:${targetId}`,
  guildPermitsPattern: (guildId: string) => `lumi:permits:${guildId}:*`,
  quarantineState: (guildId: string, userId: string) =>
    `lumi:mod:${guildId}:quarantine:${userId}`,
  securityWindow: (guildId: string, executorId: string, kind: string) =>
    `lumi:security:${guildId}:window:${kind}:${executorId}`,
  securityTripped: (guildId: string, executorId: string, kind: string) =>
    `lumi:security:${guildId}:tripped:${kind}:${executorId}`,
  joinBurst: (guildId: string) => `lumi:security:${guildId}:joins`,
  raidMode: (guildId: string) => `lumi:security:${guildId}:raid`,
  recentJoiners: (guildId: string) => `lumi:security:${guildId}:recent-joiners`,
  verifyChallenge: (guildId: string, userId: string) =>
    `lumi:security:${guildId}:verify:${userId}`,
  verifyPending: (guildId: string) => `lumi:security:${guildId}:verify:pending`,
  panicState: (guildId: string) => `lumi:security:${guildId}:panic`,
  securityRestorePending: (guildId: string) =>
    `lumi:security:${guildId}:restore-pending`,
  voiceMuteState: (guildId: string, userId: string) =>
    `lumi:mod:${guildId}:voicemute:${userId}`,
  filterHeat: (guildId: string, userId: string) =>
    `lumi:filter:${guildId}:heat:${userId}`,
  filterHeatActed: (guildId: string, userId: string) =>
    `lumi:filter:${guildId}:heatacted:${userId}`,
  filterLastMsg: (guildId: string, userId: string) =>
    `lumi:filter:${guildId}:lastmsg:${userId}`,
  filterHeatViolations: (guildId: string, userId: string) =>
    `lumi:filter:${guildId}:violations:${userId}`,
  filterHeatPanicRaiders: (guildId: string) =>
    `lumi:filter:${guildId}:heatpanic:raiders`,
  filterHeatPanicActive: (guildId: string) =>
    `lumi:filter:${guildId}:heatpanic:active`,
  filterHeatPanicFlagged: (guildId: string, userId: string) =>
    `lumi:filter:${guildId}:heatpanic:flagged:${userId}`,
  filterMentionWindow: (guildId: string) =>
    `lumi:filter:${guildId}:mentionwindow`,
  filterAutoLockdown: (guildId: string) =>
    `lumi:filter:${guildId}:autolockdown`,
  blocked: (guildId: string | null, userId: string) =>
    `lumi:block:${guildId ?? "global"}:${userId}`,
  blockedPattern: (userId: string) => `lumi:block:*:${userId}`,
  guildIgnored: (guildId: string) => `lumi:ignore:guild:${guildId}`,
  channelIgnored: (guildId: string, channelId: string) =>
    `lumi:ignore:channel:${guildId}:${channelId}`,

  botStats: () => "lumi:stats:bot",

  /**
   * Bucketed so the whole fleet does not XADD to one key. The braces are a
   * Redis Cluster hash tag: each bucket hashes on its own number, so buckets
   * land on different slots instead of one node absorbing every audit write.
   */
  auditLogsQueue: (bucket: number) => `lumi:queue:audit_logs:{${bucket}}`,

  schedulerLeader: () => "lumi:scheduler:leader",

  addonUpdateCheck: () => "lumi:addon:update-check",
} as const;

export const RedisTTL = {
  guildConfig: 60,
  guildAllModuleConfigs: 60,
  globalConfig: 120,
  guildPrefix: 60,
  permOverrides: 120,
  permits: 120,
  moduleEnabledCache: 30,
  blockedCache: 300,
  ignoreCache: 300,
  botStats: 15,
  voiceMute: 300,
  quarantine: 30 * 24 * 60 * 60,
  quarantineNegative: 60,
  warnThresholds: 300,
  warnCount: 365 * 24 * 3600,
  voiceOccupancy: 24 * 60 * 60,
  addonUpdateCheck: 300,
} as const;

/**
 * Build Redis connection options. When `REDIS_SENTINELS` is set (HA mode),
 * returns Sentinel-aware options (`sentinels` + `name`); otherwise returns
 * direct host/port. Exported so call sites that need to build their own
 * Redis clients (event-bus) stay HA-aware too.
 *
 * `REDIS_SENTINELS`: comma-separated `host:port` list of Sentinel nodes,
 * e.g. `sentinel-1:26379,sentinel-2:26379,sentinel-3:26379`.
 * `REDIS_SENTINEL_NAME`: master name as registered with Sentinel
 * (default `mymaster`).
 * `REDIS_SENTINEL_PASSWORD`: password for connecting to Sentinels themselves
 * when they require auth (separate from `REDIS_PASSWORD` for the master).
 */
export function redisConnectionOptions(): RedisOptions {
  const password = envParseString("REDIS_PASSWORD", "") || undefined;
  if (envIsDefined("REDIS_SENTINELS")) {
    const sentinels = envParseString("REDIS_SENTINELS")
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
      .map((entry) => {
        const [host, port] = entry.split(":");
        if (!host || !port) {
          throw new Error(`[Redis] Invalid REDIS_SENTINELS entry: ${entry}`);
        }
        const portNum = Number(port);
        if (!Number.isFinite(portNum)) {
          throw new Error(`[Redis] Invalid REDIS_SENTINELS port: ${entry}`);
        }
        return { host, port: portNum };
      });
    if (sentinels.length === 0) {
      throw new Error("[Redis] REDIS_SENTINELS is empty");
    }
    const sentinelPassword =
      envParseString("REDIS_SENTINEL_PASSWORD", "") || undefined;
    return {
      sentinels,
      name: envParseString("REDIS_SENTINEL_NAME", "mymaster"),
      ...(password && { password }),
      ...(sentinelPassword && { sentinelPassword }),
    };
  }
  return {
    host: envParseString("REDIS_HOST", "localhost"),
    port: envParseInteger("REDIS_PORT", 6379),
    ...(password && { password }),
  };
}

/**
 * Comma-separated `host:port` list enables Cluster mode. Cluster has no
 * numbered databases, so REDIS_CACHE_DB is ignored there - the key prefix
 * already namespaces everything.
 */
function clusterNodes(): { host: string; port: number }[] | null {
  const raw = process.env["REDIS_CLUSTER_NODES"];
  if (!raw) return null;
  const nodes = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [host = "localhost", port] = entry.split(":");
      return { host, port: Number(port) || 6379 };
    });
  return nodes.length > 0 ? nodes : null;
}

export function createRedisClient(): RedisClient {
  const nodes = clusterNodes();
  const client: RedisClient = nodes
    ? new Cluster(nodes, {
        lazyConnect: true,
        scaleReads:
          (process.env["REDIS_CLUSTER_SCALE_READS"] as
            | "all"
            | "slave"
            | "master") || "master",
        slotsRefreshTimeout: envParseInteger(
          "REDIS_CLUSTER_SLOTS_REFRESH_TIMEOUT_MS",
          2000,
        ),
        clusterRetryStrategy: (times) =>
          Math.min(100 * Math.pow(2, times), 2000),
        redisOptions: {
          ...redisConnectionOptions(),
          maxRetriesPerRequest: 3,
        },
      })
    : new Redis({
        ...redisConnectionOptions(),
        db: envParseInteger("REDIS_CACHE_DB", 0),
        lazyConnect: true,
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
      });

  client.on("error", (err) => logError("Redis", err));
  client.on("connect", () => container.logger.debug("[Redis] Connected"));
  client.on("reconnecting", () =>
    container.logger.warn("[Redis] Reconnecting..."),
  );

  return client;
}

/**
 * BullMQ (used by @sapphire/plugin-scheduled-tasks) requires its connections
 * to have `maxRetriesPerRequest: null` and to skip the ready check - otherwise
 * its blocking commands (BRPOPLPUSH, etc.) get aborted and the worker dies.
 */
export function parseRedisConnectionOption(): RedisOptions {
  return {
    ...redisConnectionOptions(),
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };
}

const INVALIDATION_CHANNEL = "lumi:cache:invalidate";

export class InvalidationBus {
  readonly #subscriber: RedisClient;
  #listeners = new Set<(keys: string[]) => void>();
  #resyncListeners = new Set<() => void | Promise<void>>();
  #started = false;
  #startPromise: Promise<void> | null = null;
  #handlerAttached = false;
  #connectionDropped = false;

  public constructor(subscriber: RedisClient) {
    this.#subscriber = subscriber;
  }

  public onInvalidate(fn: (keys: string[]) => void): () => void {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }

  public onResync(fn: () => void | Promise<void>): () => void {
    this.#resyncListeners.add(fn);
    return () => this.#resyncListeners.delete(fn);
  }

  public start(): Promise<void> {
    if (this.#started) return Promise.resolve();
    this.#startPromise ??= this.#doStart().finally(() => {
      this.#startPromise = null;
    });
    return this.#startPromise;
  }

  /** Delete locally and broadcast to peers. */
  public async invalidate(...keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    await delSafe(container.redis, keys);
    await container.redis.publish(
      INVALIDATION_CHANNEL,
      JSON.stringify({ keys }),
    );
  }

  /**
   * Pause delivery: unsubscribe and reset state, but keep the connection (and
   * the message handler) alive so a subsequent start() can resume on the same
   * client. Use close() for permanent teardown at shutdown.
   */
  public async stop(): Promise<void> {
    if (!this.#started) return;
    await this.#subscriber
      .unsubscribe(INVALIDATION_CHANNEL)
      .catch((err: unknown) => logError("Redis: unsubscribe failed", err));
    this.#started = false;
  }

  /** Permanent teardown - pause, then quit the owned subscriber connection. */
  public async close(): Promise<void> {
    await this.stop();
    await this.#subscriber
      .quit()
      .catch((err: unknown) => logError("Redis: quit failed", err));
  }

  async #doStart(): Promise<void> {
    if (this.#started) return;
    if (!this.#handlerAttached) {
      this.#subscriber.on("message", this.#onMessage);
      this.#subscriber.on("close", this.#onClose);
      this.#subscriber.on("ready", this.#onReady);
      this.#handlerAttached = true;
    }
    await this.#subscriber.subscribe(INVALIDATION_CHANNEL);
    this.#started = true;
  }

  #onMessage = (_channel: string, payload: string) => {
    const parsed = tryParseJSON(payload) as { keys?: string[] } | null;
    if (!parsed?.keys) return;
    for (const fn of this.#listeners) fn(parsed.keys);
  };

  #onClose = () => {
    if (this.#started) this.#connectionDropped = true;
  };

  #onReady = () => {
    if (!this.#connectionDropped) return;
    this.#connectionDropped = false;
    for (const fn of this.#resyncListeners) {
      Promise.resolve(fn()).catch((err: unknown) =>
        logError("Redis: invalidation resync failed", err),
      );
    }
  };
}
