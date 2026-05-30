import { container } from "@sapphire/framework";
import { envIsDefined, envParseInteger, envParseString } from "#lib/env.js";
import { Redis, type RedisOptions } from "ioredis";
import { logError } from "#utilities/errors.js";

// ─────────────────────────────────────────────────────────────────────────────
// Redis key registry — single source of truth for every key pattern.
// Format: `ember:{namespace}:{...discriminants}`.
// Never hard-code a key in feature code; always import from here.
// ─────────────────────────────────────────────────────────────────────────────

export const RedisKeys = {
  // ── Core config ────────────────────────────────────────────────────────
  guildSettings: (guildId: string) => `ember:settings:guild:${guildId}`,
  guildConfig: (module: string, guildId: string) =>
    `ember:cfg:${module}:guild:${guildId}`,
  globalConfig: () => "ember:cfg:global",
  guildPrefixes: (guildId: string) => `ember:prefix:guild:${guildId}`,

  // ── Module enable state ────────────────────────────────────────────────
  moduleEnabled: (module: string, guildId: string) =>
    `ember:module:enabled:${module}:${guildId}`,
  moduleGlobalEnabled: (module: string) =>
    `ember:module:global:enabled:${module}`,

  // ── Permissions / access control ──────────────────────────────────────
  permOverrides: (commandPath: string, guildId: string) =>
    `ember:perms:${commandPath}:${guildId}`,
  blocked: (guildId: string | null, userId: string) =>
    `ember:block:${guildId ?? "global"}:${userId}`,
  blockedPattern: (userId: string) => `ember:block:*:${userId}`,
  guildIgnored: (guildId: string) => `ember:ignore:guild:${guildId}`,
  channelIgnored: (guildId: string, channelId: string) =>
    `ember:ignore:channel:${guildId}:${channelId}`,

  // ── Cooldowns ─────────────────────────────────────────────────────────
  cooldown: (commandName: string, userId: string) =>
    `ember:cd:${commandName}:user:${userId}`,

  // ── Stats ──────────────────────────────────────────────────────────────
  botStats: () => "ember:stats:bot",

  // ── Queues ─────────────────────────────────────────────────────────────
  auditLogsQueue: () => "ember:queue:audit_logs",

  // ── Leader election ───────────────────────────────────────────────────
  // Held by the single active `scheduler` replica when
  // SCHEDULER_LEADER_LOCK=true; followers poll-block until it lapses.
  schedulerLeader: () => "ember:scheduler:leader",

  // ── Entity cache ──────────────────────────────────────────────────────
  // Minimal projections of Discord entities, populated by the gateway-event
  // listener and read by modules that previously hit `client.guilds.cache`.
  // Hashes — one key per entity. Field set kept narrow (id/name/permissions/
  // owner/parent) so 1M+ guilds at ~256 B/entity fit a single Redis db.
  entityGuild: (guildId: string) => `ember:ent:guild:${guildId}`,
  entityChannel: (channelId: string) => `ember:ent:channel:${channelId}`,
  entityRole: (roleId: string) => `ember:ent:role:${roleId}`,
  entityUser: (userId: string) => `ember:ent:user:${userId}`,
  entityMember: (guildId: string, userId: string) =>
    `ember:ent:member:${guildId}:${userId}`,
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

function baseConnection(): RedisOptions {
  return redisConnectionOptions();
}

export function createRedisClient(): Redis {
  const client = new Redis({
    ...baseConnection(),
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
    ...baseConnection(),
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Cluster-wide cache invalidation (pub/sub)
// One channel: `ember:cache:invalidate`. Payload: JSON `{ keys: string[] }`.
// Locally DEL is immediate; the broadcast tells peers to drop their memos.
// ─────────────────────────────────────────────────────────────────────────────

const INVALIDATION_CHANNEL = "ember:cache:invalidate";

export class InvalidationBus {
  readonly #subscriber: Redis;
  #listeners = new Set<(keys: string[]) => void>();
  #started = false;

  public constructor(subscriber: Redis) {
    this.#subscriber = subscriber;
  }

  public onInvalidate(fn: (keys: string[]) => void): () => void {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }

  public async start(): Promise<void> {
    if (this.#started) return;
    await this.#subscriber.subscribe(INVALIDATION_CHANNEL);
    this.#subscriber.on("message", (_channel, payload) => {
      try {
        const { keys } = JSON.parse(payload) as { keys: string[] };
        for (const fn of this.#listeners) fn(keys);
      } catch (err: unknown) {
        logError("Invalidation: malformed payload", err);
      }
    });
    this.#started = true;
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

  public async stop(): Promise<void> {
    if (!this.#started) return;
    await this.#subscriber
      .unsubscribe(INVALIDATION_CHANNEL)
      .catch((err: unknown) => logError("Redis: unsubscribe failed", err));
    await this.#subscriber
      .quit()
      .catch((err: unknown) => logError("Redis: quit failed", err));
    this.#started = false;
  }
}
