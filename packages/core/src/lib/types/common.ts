import type { RedisClient } from "#lib/database/cluster-safe.js";
import type { DatabaseClient } from "#lib/prisma/client.js";
import type { ModuleStore } from "#lib/module-system/ModuleStore.js";
import type { InvalidationBus } from "#lib/database/redis.js";
import type { EventBus } from "@lumi/event-bus";
import type { DatabaseService } from "#lib/prisma/DatabaseService.js";
import type { Message } from "discord.js";
import "@sapphire/pieces";

export type IntegerString = `${number}`;

/** A Discord message that is guaranteed to be from a guild and from a non-bot user. */
export type GuildMessage = Message<true>;

/** Custom events emitted by the Lumi client, separate from discord.js built-ins. */
export const LumiEvents = {
  /** Fired for every guild message from a non-bot, non-webhook user. */
  GuildUserMessage: "lumiGuildUserMessage",
  /**
   * Fired when such a message is edited. Kept separate from GuildUserMessage so
   * consumers can re-screen the new content without rate-based counters
   * treating one message as several.
   */
  GuildUserMessageEdit: "lumiGuildUserMessageEdit",
} as const;

declare module "discord.js" {
  interface ClientEvents {
    lumiGuildUserMessage: [message: Message<true>];
    lumiGuildUserMessageEdit: [message: Message<true>];
  }
}

export type DatabaseRepositories = DatabaseService;

export type { ScheduledTasks } from "@sapphire/plugin-scheduled-tasks";

declare module "@sapphire/plugin-scheduled-tasks" {
  interface ScheduledTasks {
    "flush-logs": Record<string, never>;
  }
}

/** Modules register per-key invalidation callbacks here instead of patching ConfigService. */
export type ConfigChangeHook = (guildId: string, key: string) => Promise<void>;

/**
 * Guard run before a config value is persisted, for checks the schema cannot
 * express (e.g. proving a regex terminates). Return a reason to reject the
 * write, or null to accept it.
 */
export type ConfigValueValidator = (
  value: unknown,
  guildId: string,
) => Promise<string | null> | string | null;

declare module "@sapphire/pieces" {
  interface Container {
    readonly prisma: DatabaseClient;
    readonly redis: RedisClient;
    readonly invalidation: InvalidationBus;
    readonly db: DatabaseRepositories;
    readonly eventBus: EventBus;
    readonly moduleStore: ModuleStore;
    readonly permitResolver: import("#lib/permissions/PermitResolver.js").PermitResolver;

    stats: {
      messages: number;
      identifies: number;
      resumes: number;
      lastIdentify: Date | null;
      lastResume: Date | null;
    };

    /** Key format: `"<moduleName>:<configKey>"` */
    readonly configChangeHooks: Map<string, ConfigChangeHook>;

    /** Pre-write value guards. Key format: `"<moduleName>:<configKey>"` */
    readonly configValueValidators: Map<string, ConfigValueValidator>;
  }
}


import type { ServiceStore } from "#lib/module-system/ServiceStore.js";

declare module "@sapphire/framework" {
  interface StoreRegistryEntries {
    services: ServiceStore;
  }
}

declare module "#lib/env.js" {
  interface Env {
    BOT_TOKEN: string;
    CLIENT_ID: string;
    OWNER_IDS: string;
    DEFAULT_PREFIX: string;
    NODE_ENV: "development" | "production" | "test";
    LOG_LEVEL: "trace" | "debug" | "info" | "warn" | "error" | "fatal";
    POSTGRES_URL: string;
    REDIS_HOST: string;
    REDIS_PORT: IntegerString;
    REDIS_PASSWORD: string;
    REDIS_CACHE_DB: IntegerString;
    REDIS_TASK_DB: IntegerString;
    /** Comma-separated `host:port` Sentinel list. When set, all
     * Redis clients (cache, BullMQ, streams, leader-lock) talk to Sentinels
     * for master discovery + failover. Unset → direct REDIS_HOST/PORT. */
    REDIS_SENTINELS: string;
    /** Sentinel master name. Default "mymaster". */
    REDIS_SENTINEL_NAME: string;
    /** Password for Sentinel processes themselves (distinct from REDIS_PASSWORD for the master). */
    REDIS_SENTINEL_PASSWORD: string;
    /** Internal RPC HTTP server bind port. Default 8091. */
    RPC_HTTP_PORT: IntegerString;
    /** Internal RPC HTTP server bind host. Default "127.0.0.1"; set to
     * "0.0.0.0" only where the dashboard reaches the worker over a container
     * network. */
    RPC_HTTP_HOST: string;
    /** Shared secret the dashboard presents as `Authorization: Bearer <token>`
     * on every internal RPC call. Required in production - the RPC server
     * refuses to start without it. */
    RPC_INTERNAL_TOKEN: string;
    /** Approximate per-stream cap for bus events. Default 100000. */
    EVENT_STREAM_MAXLEN: IntegerString;
    /** Redis Streams consumer idle threshold in ms. Default 60000. */
    EVENT_STREAM_ACK_WAIT_MS: IntegerString;
    /** Stable per-replica consumer id for the worker pool. Falls back to $HOSTNAME, then pid. */
    LUMI_CONSUMER_ID: string;
  }
}
