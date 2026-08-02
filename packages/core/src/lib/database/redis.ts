import { container } from "@sapphire/framework";
import { tryParseJSON } from "@sapphire/utilities";
import { envIsDefined, envParseInteger, envParseString } from "#lib/env.js";
import { Redis, type RedisOptions } from "ioredis";
import { logError } from "#lib/utilities/errors.js";

export const RedisKeys = {
  guildSettings: (guildId: string) => `lumi:settings:guild:${guildId}`,
  guildConfig: (module: string, guildId: string) =>
    `lumi:cfg:${module}:guild:${guildId}`,
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
    targetType: "user" | "role",
    targetId: string,
  ) => `lumi:permits:${guildId}:${targetType}:${targetId}`,
  guildPermitsPattern: (guildId: string) => `lumi:permits:${guildId}:*`,
  quarantineState: (guildId: string, userId: string) =>
    `lumi:mod:${guildId}:quarantine:${userId}`,
  securityWindow: (guildId: string, executorId: string, kind: string) =>
    `lumi:security:${guildId}:window:${kind}:${executorId}`,
  securityTripped: (guildId: string, executorId: string) =>
    `lumi:security:${guildId}:tripped:${executorId}`,
  joinBurst: (guildId: string) => `lumi:security:${guildId}:joins`,
  raidMode: (guildId: string) => `lumi:security:${guildId}:raid`,
  verifyChallenge: (guildId: string, userId: string) =>
    `lumi:security:${guildId}:verify:${userId}`,
  verifyPending: (guildId: string) => `lumi:security:${guildId}:verify:pending`,
  panicState: (guildId: string) => `lumi:security:${guildId}:panic`,
  voiceMuteState: (guildId: string, userId: string) =>
    `lumi:mod:${guildId}:voicemute:${userId}`,
  filterHeat: (guildId: string, userId: string) =>
    `lumi:filter:${guildId}:heat:${userId}`,
  filterHeatActed: (guildId: string, userId: string) =>
    `lumi:filter:${guildId}:heatacted:${userId}`,
  filterLastMsg: (guildId: string, userId: string) =>
    `lumi:filter:${guildId}:lastmsg:${userId}`,
  blocked: (guildId: string | null, userId: string) =>
    `lumi:block:${guildId ?? "global"}:${userId}`,
  blockedPattern: (userId: string) => `lumi:block:*:${userId}`,
  guildIgnored: (guildId: string) => `lumi:ignore:guild:${guildId}`,
  channelIgnored: (guildId: string, channelId: string) =>
    `lumi:ignore:channel:${guildId}:${channelId}`,

  botStats: () => "lumi:stats:bot",

  auditLogsQueue: () => "lumi:queue:audit_logs",

  schedulerLeader: () => "lumi:scheduler:leader",
  commandRegistrationLeader: () => "lumi:commands:registration:leader",

  entityGuild: (guildId: string) => `lumi:ent:guild:${guildId}`,
  entityChannel: (channelId: string) => `lumi:ent:channel:${channelId}`,
  entityRole: (roleId: string) => `lumi:ent:role:${roleId}`,
  entityUser: (userId: string) => `lumi:ent:user:${userId}`,
  entityMember: (guildId: string, userId: string) =>
    `lumi:ent:member:${guildId}:${userId}`,

  addonUpdateCheck: () => "lumi:addon:update-check",
} as const;

export const RedisTTL = {
  guildConfig: 60,
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
  warnThresholds: 300,
  warnCount: 365 * 24 * 3600,
  voiceOccupancy: 24 * 60 * 60,
  entity: 60 * 60 * 24,
  addonUpdateCheck: 300,
} as const;

/**
 * Build Redis connection options. When `REDIS_SENTINELS` is set (HA mode),
 * returns Sentinel-aware options (`sentinels` + `name`); otherwise returns
 * direct host/port. Exported so call sites that need to build their own
 * Redis clients (event-bus, cluster coordinator) stay HA-aware too.
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

export function createRedisClient(): Redis {
  const client = new Redis({
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
  readonly #subscriber: Redis;
  #listeners = new Set<(keys: string[]) => void>();
  #resyncListeners = new Set<() => void | Promise<void>>();
  #started = false;
  #startPromise: Promise<void> | null = null;
  #handlerAttached = false;
  #connectionDropped = false;

  public constructor(subscriber: Redis) {
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
    await container.redis.del(...keys);
    await container.redis.publish(
      INVALIDATION_CHANNEL,
      JSON.stringify({ keys }),
    );

    setTimeout(() => {
      container.redis
        .del(...keys)
        .catch((err: unknown) => logError("Redis: delayed re-invalidation failed", err));
    }, 500).unref();
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
