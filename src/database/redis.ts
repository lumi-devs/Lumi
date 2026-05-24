import { container } from "@sapphire/framework";
import { envParseInteger, envParseString } from "#lib/env.js";
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

  // ── Module: afk ────────────────────────────────────────────────────────
  afk: (guildId: string, userId: string) => `ember:afk:${guildId}:${userId}`,
  afkMentionCooldown: (channelId: string) =>
    `ember:afk:cd:mention:${channelId}`,
  afkWelcomeCooldown: (channelId: string, userId: string) =>
    `ember:afk:cd:welcome:${channelId}:${userId}`,
  afkRemovalCooldown: (guildId: string, userId: string) =>
    `ember:afk:cd:removal:${guildId}:${userId}`,
  afkRemovalCooldownPattern: () => "ember:afk:cd:removal:*",
  afkNickEditCooldown: (userId: string) => `ember:afk:cd:nick:${userId}`,
  afkAllForUserPattern: (userId: string) => `ember:afk:*:${userId}`,
  afkMentions: (guildId: string, userId: string) =>
    `ember:afk:mentions:${guildId}:${userId}`,

  // ── Module: tempvc ─────────────────────────────────────────────────────
  tempVc: (channelId: string) => `ember:tempvc:${channelId}`,
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
  afkEntry: 24 * 60 * 60,
  afkMentions: 24 * 60 * 60,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Client factories
// ─────────────────────────────────────────────────────────────────────────────

function baseConnection(): RedisOptions {
  return {
    host: envParseString("REDIS_HOST", "localhost"),
    port: envParseInteger("REDIS_PORT", 6379),
    password: envParseString("REDIS_PASSWORD", "") || undefined,
  };
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
  private readonly _subscriber: Redis;
  private _listeners = new Set<(keys: string[]) => void>();
  private _started = false;

  public constructor(subscriber: Redis) {
    this._subscriber = subscriber;
  }

  public onInvalidate(fn: (keys: string[]) => void): () => void {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  public async start(): Promise<void> {
    if (this._started) return;
    await this._subscriber.subscribe(INVALIDATION_CHANNEL);
    this._subscriber.on("message", (_channel, payload) => {
      try {
        const { keys } = JSON.parse(payload) as { keys: string[] };
        for (const fn of this._listeners) fn(keys);
      } catch (err: unknown) {
        logError("Invalidation: malformed payload", err);
      }
    });
    this._started = true;
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
    if (!this._started) return;
    await this._subscriber
      .unsubscribe(INVALIDATION_CHANNEL)
      .catch((err: unknown) => logError("Redis: unsubscribe failed", err));
    await this._subscriber
      .quit()
      .catch((err: unknown) => logError("Redis: quit failed", err));
    this._started = false;
  }
}
