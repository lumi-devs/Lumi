import { container } from "@sapphire/framework";
import { envIsDefined, envParseInteger, envParseString } from "#lib/env.js";
import { Redis, type RedisOptions } from "ioredis";
import { logError } from "#utilities/errors.js";

// ─────────────────────────────────────────────────────────────────────────────
// Redis key registry — single source of truth for every key pattern.
// Format: `lumi:{namespace}:{...discriminants}`.
// Never hard-code a key in feature code; always import from here.
// ─────────────────────────────────────────────────────────────────────────────

export const RedisKeys = {
  // ── Core config ────────────────────────────────────────────────────────
  guildSettings: (guildId: string) => `lumi:settings:guild:${guildId}`,
  guildConfig: (module: string, guildId: string) =>
    `lumi:cfg:${module}:guild:${guildId}`,
  globalConfig: () => "lumi:cfg:global",
  guildPrefixes: (guildId: string) => `lumi:prefix:guild:${guildId}`,

  // ── Module enable state ────────────────────────────────────────────────
  moduleEnabled: (module: string, guildId: string) =>
    `lumi:module:enabled:${module}:${guildId}`,
  moduleGlobalEnabled: (module: string) =>
    `lumi:module:global:enabled:${module}`,

  // ── Permissions / access control ──────────────────────────────────────
  permOverrides: (commandPath: string, guildId: string) =>
    `lumi:perms:${commandPath}:${guildId}`,
  blocked: (guildId: string | null, userId: string) =>
    `lumi:block:${guildId ?? "global"}:${userId}`,
  blockedPattern: (userId: string) => `lumi:block:*:${userId}`,
  guildIgnored: (guildId: string) => `lumi:ignore:guild:${guildId}`,
  channelIgnored: (guildId: string, channelId: string) =>
    `lumi:ignore:channel:${guildId}:${channelId}`,

  // ── Cooldowns ─────────────────────────────────────────────────────────
  cooldown: (commandName: string, userId: string) =>
    `lumi:cd:${commandName}:user:${userId}`,

  // ── Stats ──────────────────────────────────────────────────────────────
  botStats: () => "lumi:stats:bot",

  // ── Queues ─────────────────────────────────────────────────────────────
  auditLogsQueue: () => "lumi:queue:audit_logs",

  // ── Leader election ───────────────────────────────────────────────────
  // Held by the single active `scheduler` replica when
  // SCHEDULER_LEADER_LOCK=true; followers poll-block until it lapses.
  schedulerLeader: () => "lumi:scheduler:leader",

  // ── Entity cache ──────────────────────────────────────────────────────
  // Minimal projections of Discord entities, populated by the gateway-event
  // listener and read by modules that previously hit `client.guilds.cache`.
  // Hashes — one key per entity. Field set kept narrow (id/name/permissions/
  // owner/parent) so 1M+ guilds at ~256 B/entity fit a single Redis db.
  entityGuild: (guildId: string) => `lumi:ent:guild:${guildId}`,
  entityChannel: (channelId: string) => `lumi:ent:channel:${channelId}`,
  entityRole: (roleId: string) => `lumi:ent:role:${roleId}`,
  entityUser: (userId: string) => `lumi:ent:user:${userId}`,
  entityMember: (guildId: string, userId: string) =>
    `lumi:ent:member:${guildId}:${userId}`,

  // ── Dashboard api (apps/api) ──────────────────────────────────────────
  // Opaque session id → JSON session blob; short-lived OAuth state → CSRF nonce.
  // Owned by the api service; listed here so the api reuses one key registry
  // instead of hard-coding strings (CLAUDE.md: never hand-roll a Redis key).
  apiSession: (sessionId: string) => `lumi:api:session:${sessionId}`,
  apiOAuthState: (state: string) => `lumi:api:oauth:state:${state}`,
} as const;

export const RedisTTL = {
  guildConfig: 60,
  globalConfig: 120,
  guildPrefix: 60,
  permOverrides: 120,
  moduleEnabledCache: 30,
  blockedCache: 300,
  ignoreCache: 300,
  botStats: 15,
  // Entity projections refreshed on every relevant gateway dispatch, but the
  // TTL guards against orphaned records when this worker missed the DELETE.
  // 24h is conservative; raise for read-heavy quiet servers, lower if the
  // memory budget tightens.
  entity: 60 * 60 * 24,
  // api login session (sliding — refreshed on each authenticated request).
  apiSession: 60 * 60 * 24 * 7,
  // OAuth CSRF state: only needs to survive the round-trip to Discord and back.
  apiOAuthState: 60 * 10,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Client factories
// ─────────────────────────────────────────────────────────────────────────────

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
      .filter(Boolean)
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
 * to have `maxRetriesPerRequest: null` and to skip the ready check — otherwise
 * its blocking commands (BRPOPLPUSH, etc.) get aborted and the worker dies.
 */
export function parseRedisConnectionOption(): RedisOptions {
  return {
    ...redisConnectionOptions(),
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Cluster-wide cache invalidation (pub/sub)
// One channel: `lumi:cache:invalidate`. Payload: JSON `{ keys: string[] }`.
// Locally DEL is immediate; the broadcast tells peers to drop their memos.
// ─────────────────────────────────────────────────────────────────────────────

const INVALIDATION_CHANNEL = "lumi:cache:invalidate";

export class InvalidationBus {
  readonly #subscriber: Redis;
  #listeners = new Set<(keys: string[]) => void>();
  #started = false;
  #startPromise: Promise<void> | null = null;
  #handlerAttached = false;

  public constructor(subscriber: Redis) {
    this.#subscriber = subscriber;
  }

  public onInvalidate(fn: (keys: string[]) => void): () => void {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }

  public start(): Promise<void> {
    if (this.#started) return Promise.resolve();
    // Deduplicate concurrent start() calls — only one subscription is issued.
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

  /** Permanent teardown — pause, then quit the owned subscriber connection. */
  public async close(): Promise<void> {
    await this.stop();
    await this.#subscriber
      .quit()
      .catch((err: unknown) => logError("Redis: quit failed", err));
  }

  async #doStart(): Promise<void> {
    if (this.#started) return;
    // Attach the message handler exactly once for the lifetime of this bus —
    // start()/stop() cycles must not stack duplicate listeners.
    if (!this.#handlerAttached) {
      this.#subscriber.on("message", this.#onMessage);
      this.#handlerAttached = true;
    }
    await this.#subscriber.subscribe(INVALIDATION_CHANNEL);
    this.#started = true;
  }

  #onMessage = (_channel: string, payload: string) => {
    try {
      const { keys } = JSON.parse(payload) as { keys: string[] };
      for (const fn of this.#listeners) fn(keys);
    } catch (err: unknown) {
      logError("Invalidation: malformed payload", err);
    }
  };
}
